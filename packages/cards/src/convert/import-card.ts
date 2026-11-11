import { type AstIssue, type CardDefinition, validateCard } from '@commander-arena/engine';
import type { ImportedCard, StoredCard, SupportReport, UnparsedAbility } from '../types';
import { PARSER_VERSION } from '../version';
import { convertFace } from './face';
import { resolveLayout } from './layout';
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

function parseWithGrammar(
  stored: StoredCard,
  rules?: readonly GrammarRule[],
  spellRules?: readonly SpellRule[],
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
  const definition: CardDefinition = {
    oracleId: stored.oracleId,
    name: stored.name,
    layout: resolved.layout,
    faces: faces.length > 0 ? faces : [{ ...EMPTY_FACE, name: stored.name }],
    colorIdentity: [...stored.colorIdentity],
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
 */
export function importCard(
  stored: StoredCard,
  parserVersion: number = PARSER_VERSION,
  overrides: OverrideRegistry = DEFAULT_OVERRIDES,
  rules?: readonly GrammarRule[],
  spellRules: readonly SpellRule[] = DEFAULT_SPELL_RULES,
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
    parsed = parseWithGrammar(stored, rules, spellRules);
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
