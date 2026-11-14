import {
  type AstIssue,
  type CardDefinition,
  type CardFace,
  validateCard,
} from '@commander-arena/engine';
import type { ImportedCard, StoredCard, SupportReport, UnparsedAbility } from '../types';
import { PARSER_VERSION } from '../version';
import { convertFace } from './face';
import { resolveLayout } from './layout';
import { isMeldLookupError, type MeldLookup, meldRelation, meldReminderPartner } from './meld';
import { DEFAULT_OVERRIDES, type OverrideRegistry } from './override';
import { chapterNumbers } from './parser/roman';
import { DEFAULT_SPELL_RULES } from './parser/rules/index';
import type { GrammarRule, SpellRule } from './parser/types';

/** A face with no abilities and no types, for stored data that has no faces at all. */
const EMPTY_FACE = {
  manaCost: null,
  supertypes: [],
  types: [],
  subtypes: [],
  colors: [],
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
  spell: null,
} as const;

interface ParsedCard {
  readonly definition: CardDefinition;
  readonly unparsed: UnparsedAbility[];
  readonly reasons: string[];
}

const normalizedName = (name: string): string => name.trim().toLowerCase();

/**
 * The combined face of a meld pair (CR 712.4, 712.8g, D-280): the melded face is a card of its own in the data, which the game fetches like any other card (the
 * card of this layout names it in `relatedParts`), and the engine's definition of each half holds its converted face as `faces[1]`. A half is usable only if
 * the data names its counterpart and its melded face, the reminder text agrees, and the melded face was available, one-faced and fully read; every one of those
 * that fails is a reason beginning `layout "meld"`, and the card falls back to its front face as a card of the layout `normal`.
 */
function meldPieces(
  stored: StoredCard,
  related: MeldLookup | undefined,
  rules?: readonly GrammarRule[],
  spellRules?: readonly SpellRule[],
):
  | {
      readonly back: CardFace;
      readonly partner: string;
      readonly unparsed: UnparsedAbility[];
      readonly reasons: string[];
    }
  | { readonly back: undefined; readonly reasons: string[] } {
  const relation = meldRelation(stored);
  if (relation.role !== 'half' || relation.partner === undefined || relation.result === undefined) {
    return {
      back: undefined,
      reasons: (relation.problems.length > 0
        ? relation.problems
        : ['the card data does not name its meld pair']
      ).map((p) => `layout "meld": ${p}`),
    };
  }
  const reasons: string[] = [];
  const reminder = meldReminderPartner(stored);
  if (reminder !== null && normalizedName(reminder) !== normalizedName(relation.partner)) {
    reasons.push(
      `layout "meld": the card text says it melds with ${reminder}, but the card data names ${relation.partner}`,
    );
  }
  const answer = related?.(relation.result);
  if (answer === undefined) {
    return {
      back: undefined,
      reasons: [
        ...reasons,
        `layout "meld": the melded face "${relation.result}" was not available, so what the two cards become is not known`,
      ],
    };
  }
  if (isMeldLookupError(answer)) {
    return {
      back: undefined,
      reasons: [
        ...reasons,
        `layout "meld": the melded face "${relation.result}" could not be fetched: ${answer.error}`,
      ],
    };
  }
  const front = answer.faces[0];
  if (
    answer.faces.length !== 1 ||
    front === undefined ||
    normalizedName(answer.name) !== normalizedName(relation.result)
  ) {
    return {
      back: undefined,
      reasons: [
        ...reasons,
        `layout "meld": the melded face "${relation.result}" is not a card of one face with that name (found "${answer.name}")`,
      ],
    };
  }
  const converted = convertFace(front, 1, rules, spellRules);
  return {
    back: converted.face,
    partner: relation.partner,
    unparsed: converted.unparsed,
    reasons: [...reasons, ...converted.reasons.map((r) => `face 1: ${r}`)],
  };
}

function parseWithGrammar(
  stored: StoredCard,
  rules?: readonly GrammarRule[],
  spellRules?: readonly SpellRule[],
  related?: MeldLookup,
): ParsedCard {
  const resolved = resolveLayout(stored);
  const reasons = [...resolved.reasons];
  const unparsed: UnparsedAbility[] = [];
  const faces = resolved.faces.map(({ index, face }) => {
    const converted = convertFace(face, index, rules, spellRules);
    unparsed.push(...converted.unparsed);
    for (const reason of converted.reasons) {
      reasons.push(stored.faces.length > 1 ? `face ${index}: ${reason}` : reason);
    }
    return converted.face;
  });
  // CR 712.4b (D-280): the melded face of a pair is only the characteristics of a melded permanent; a card that is that face is not a card a game can hold.
  if (meldRelation(stored).role === 'result') {
    reasons.push(
      'layout "meld": this is the combined face of a meld pair, which exists only as the two meld cards put together (CR 712.4b)',
    );
  }
  let layout = resolved.layout;
  let meld: CardDefinition['meld'];
  if (resolved.layout === 'meld') {
    const pieces = meldPieces(stored, related, rules, spellRules);
    reasons.push(...pieces.reasons);
    if (pieces.back === undefined) {
      layout = 'normal';
    } else {
      faces.push(pieces.back);
      unparsed.push(...pieces.unparsed);
      meld = { partner: pieces.partner };
    }
  }
  const definition: CardDefinition = {
    oracleId: stored.oracleId,
    name: stored.name,
    layout,
    faces: faces.length > 0 ? faces : [{ ...EMPTY_FACE, name: stored.name }],
    colorIdentity: [...stored.colorIdentity],
    ...(meld === undefined ? {} : { meld }),
    support: 'supported',
  };
  return { definition, unparsed, reasons };
}

/** Engine issues that only repeat a cause already reported more precisely. */
function isRedundant(
  issue: AstIssue,
  unparsed: readonly UnparsedAbility[],
  layoutReported: boolean,
) {
  if (layoutReported && issue.path === 'layout') return true;
  // A meld card whose pair could not be read falls back to a card of the layout `normal` that still holds its meld ability: the layout reason is the cause (D-280).
  if (layoutReported && issue.message.startsWith('only a meld card has a meld ability'))
    return true;
  // The engine's check of an Adventure face (card type only) repeats the import's own, which also
  // names the face and asks for the Adventure subtype.
  if (
    layoutReported &&
    issue.path === 'faces[1].types' &&
    issue.message.startsWith('layout adventure needs faces[1]')
  ) {
    return true;
  }
  const spell = /^faces\[(\d+)\]\.spell$/.exec(issue.path);
  if (spell !== null) {
    return (
      issue.message.startsWith('an instant or sorcery') &&
      unparsed.some((u) => u.face === Number(spell[1]))
    );
  }
  // An overloaded spell whose spell text was not read has no text the engine could change: the dropped
  // line is the cause (stage P22). A text that was read and cannot be changed (modal, a player slot) keeps
  // the engine's own reason.
  const overload = /^faces\[(\d+)\]\.alternativeCosts\[\d+\]$/.exec(issue.path);
  if (overload !== null && issue.message.startsWith('overload needs spell text')) {
    return unparsed.some((u) => u.face === Number(overload[1]));
  }
  // "Sacrifice it unless it escaped" on a card whose Escape line was not read: nothing could have escaped only
  // because that line is missing, so the dropped line is the cause (stage P23).
  const escaped = /^faces\[(\d+)\]$/.exec(issue.path);
  if (
    escaped !== null &&
    issue.message.startsWith('the escaped condition and "escapes with" need')
  ) {
    return unparsed.some((u) => u.face === Number(escaped[1]) && /^escape—/i.test(u.text));
  }
  const abilities = /^faces\[(\d+)\]\.abilities$/.exec(issue.path);
  // A Saga whose chapter line was dropped lacks that chapter: the dropped line is the cause.
  if (abilities !== null && /^chapter \d+ has no chapter ability/.test(issue.message)) {
    return unparsed.some((u) => u.face === Number(abilities[1]) && chapterNumbers(u.text) !== null);
  }
  // An Aura whose "Enchant ..." line was not read ("Enchant player") has an enchant ability in its
  // text: the dropped line is the cause, and "needs an enchant ability" would blame the card.
  return (
    abilities !== null &&
    issue.message.startsWith('an Aura needs an enchant ability') &&
    unparsed.some((u) => u.face === Number(abilities[1]) && /^enchant /i.test(u.text))
  );
}

/**
 * Converts a stored Scryfall card into an engine definition and its support status (SPEC 7.1).
 *
 * Order: a fixture that agrees with the real card wins; otherwise the grammar parses every face. A card is `supported` only if every ability on every face parsed, nothing
 * else was reported (layout, types, printed values, a fixture mismatch) and the definition passes
 * the engine's `validateCard`. There is no partial status: text that was not understood is
 * dropped from the definition and listed in `support.unparsed`.
 *
 * `related` finds the melded face of a meld card by name (D-280): the cards the importer fetched with the deck. A meld card whose melded face it does not give is unsupported with
 * a reason that says so, so a caller that passes none gets the honest answer, not a guess.
 */
export function importCard(
  stored: StoredCard,
  parserVersion: number = PARSER_VERSION,
  overrides: OverrideRegistry = DEFAULT_OVERRIDES,
  rules?: readonly GrammarRule[],
  spellRules: readonly SpellRule[] = DEFAULT_SPELL_RULES,
  related?: MeldLookup,
): ImportedCard {
  const lookup = overrides.lookup(stored);
  const reasons: string[] = [];
  let source: SupportReport['source'] = 'parser';
  let parsed: ParsedCard;
  if (lookup?.kind === 'match') {
    source = lookup.source;
    parsed = { definition: lookup.definition, unparsed: [], reasons: [] };
  } else {
    if (lookup?.kind === 'mismatch') reasons.push(...lookup.reasons);
    parsed = parseWithGrammar(stored, rules, spellRules, related);
  }
  reasons.push(...parsed.reasons);
  // A stale engine fixture blocks (D-052): it is the project's own definition and must be fixed.
  const blocking = [...reasons];
  const layoutReported = blocking.some((r) => r.startsWith('layout '));
  for (const issue of validateCard(parsed.definition)) {
    if (!isRedundant(issue, parsed.unparsed, layoutReported)) {
      blocking.push(`${issue.path}: ${issue.message}`);
    }
  }
  const supported = blocking.length === 0 && parsed.unparsed.length === 0;
  const status = supported ? 'supported' : 'unsupported';
  return {
    stored,
    definition: { ...parsed.definition, support: status },
    support: {
      status,
      parserVersion,
      source,
      unparsed: parsed.unparsed,
      reasons: [...new Set(blocking)],
    },
  };
}
