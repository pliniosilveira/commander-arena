import type { Ability, AlternativeCost, Cost, Effect, SpellText } from '@commander-arena/engine';
import type { UnparsedAbility } from '../../types';
import { type CompileOptions, compileLine } from './compile';
import { unparsedAbility } from './diagnostics';
import { finishSpell, type SpellParts } from './lower/index';
import {
  escapeRegExp,
  type NormalizeOptions,
  namesItselfInQuotes,
  normalizeOracleText,
  selfNames,
  splitAbilities,
  stripFlavorWord,
} from './normalize';
import { DEFAULT_RULES } from './rules/index';
import { buildRuleSet } from './rules/registry';
import type { GrammarRule, SpellRule } from './types';

export interface FaceParse {
  /** The abilities that parsed completely, in text order. */
  readonly abilities: readonly Ability[];
  /**
   * What the face's instant or sorcery text does, or null: no spell rules were given, or no line
   * was spell text that parsed completely.
   */
  readonly spell: SpellText | null;
  /**
   * "As an additional cost to cast this spell, ..." lines (CR 118.8), in text order: the face's
   * `additionalCosts`. Empty when the face has none.
   */
  readonly additionalCosts: readonly Cost[];
  /** "You may cast this spell without paying its mana cost" lines (CR 118.9): `alternativeCosts`. */
  readonly alternativeCosts: readonly AlternativeCost[];
  /** "..., sacrifice an artifact or creature or pay {4}" (stage P38, D-182, CR 118.8): the face's `additionalCostChoice`, or null. */
  readonly additionalCostChoice: readonly [readonly Cost[], readonly Cost[]] | null;
  /** The abilities that did not; they are dropped from the definition, never half-executed. */
  readonly unparsed: readonly UnparsedAbility[];
  /** The normalized text, one entry per ability line (what `ability` indexes into). */
  readonly lines: readonly string[];
}

/**
 * The short name a token "named ~'s X" is given back (D-266), or '' when the text does not say which name it used. Normalization writes the whole name of the
 * card and its short name both as `~`, so a token named with the whole name ("named Ajani, Strength of the Pride's Pridemate", CR 111.4) cannot be told from one
 * named with the short name afterwards: the text as written is checked here, and such a name is refused instead of being given the short one.
 */
function tokenSelfName(oracleText: string, options: NormalizeOptions): string {
  const names = selfNames(options);
  const short = names.at(-1) ?? '';
  const whole = names[0] ?? '';
  if (short === whole) return short;
  const wholeInName = new RegExp(`\\bnamed ${escapeRegExp(whole)}(?![\\p{L}\\p{N}])`, 'u');
  return wholeInName.test(oracleText) ? '' : short;
}

/**
 * Parses one face's Oracle text. `ability` in an UnparsedAbility is the 0-based index of the
 * line among the normalized ability lines (reminder text removed, bullets joined).
 *
 * `rules` is the grammar. `spellRules` is given only for an instant or sorcery face: a line no
 * ability reading claims is then read as spell text, and the spell lines that parse are joined in
 * order into `spell`, with one numbering of targets across them.
 */
export function parseFaceText(
  oracleText: string,
  options: NormalizeOptions,
  faceIndex: number,
  rules: readonly GrammarRule[] = DEFAULT_RULES,
  spellRules: readonly SpellRule[] = [],
  faceTypes: readonly string[] = [],
  faceSubtypes: readonly string[] = [],
): FaceParse {
  const face = spellRules.length > 0 ? 'spell' : 'permanent';
  const split = splitAbilities(normalizeOracleText(oracleText, options));
  const lines = face === 'spell' ? joinReferenceLines(joinInsteadLines(split)) : split;
  const ruleSet = buildRuleSet(rules);
  const namedInQuotes = namesItselfInQuotes(oracleText, options);
  const selfName = tokenSelfName(oracleText, options);
  const scope = { targetCount: 0 };
  const abilities: Ability[] = [];
  const spellParts: { parts: SpellParts; index: number; text: string; ruleId: string }[] = [];
  const unparsed: UnparsedAbility[] = [];
  const additionalCosts: Cost[] = [];
  const alternativeCosts: AlternativeCost[] = [];
  let additionalCostChoice: readonly [readonly Cost[], readonly Cost[]] | null = null;
  // The line each ability came from, for a refusal that is found only once every line is read (a linked exile, stage P31).
  const lineOf: { index: number; text: string; ruleId: string }[] = [];
  for (const [index, text] of lines.entries()) {
    const lineOptions: CompileOptions = {
      rules: ruleSet,
      face,
      faceTypes,
      faceSubtypes,
      scope,
      name: options.name,
      namedInQuotes,
      selfName,
    };
    const asWritten = compileLine(text, lineOptions);
    // CR 207.2d (D-204): a flavor word has no rules meaning, but no list names them, so the label is taken off only when the line did not
    // read as written, and the line is read again without it. A line that reads today never changes; a wrong strip can only turn an unread
    // line into a read one. If the line still does not read, the diagnostic is the one of the line without its label (it says what is
    // really unread), under the text as written.
    const bare =
      asWritten.ok || asWritten.failure.reason !== 'unrecognised' ? text : stripFlavorWord(text);
    const result = bare === text ? asWritten : compileLine(bare, lineOptions);
    if (!result.ok) {
      unparsed.push(unparsedAbility(faceIndex, index, text, result.failure));
    } else if (result.kind === 'abilities') {
      abilities.push(...result.abilities);
      for (const _ of result.abilities) lineOf.push({ index, text, ruleId: result.ruleId });
    } else if (result.kind === 'faceCosts') {
      // The engine runs one choice between two additional costs: a second one is dropped, never half run.
      if (result.costs.additionalCostChoice !== undefined && additionalCostChoice !== null) {
        unparsed.push(
          unparsedAbility(faceIndex, index, text, {
            reason: 'notRunnable',
            stoppedAt: text,
            closestRule: result.ruleId,
            recognised: [],
          }),
        );
        continue;
      }
      additionalCosts.push(...result.costs.additionalCosts);
      alternativeCosts.push(...result.costs.alternativeCosts);
      // D-492: a line that is a cost and an ability of the card ("When you do, copy ~ for each creature sacrificed this way").
      for (const ability of result.costs.abilities ?? []) {
        abilities.push(ability);
        lineOf.push({ index, text, ruleId: result.ruleId });
      }
      if (result.costs.additionalCostChoice !== undefined) {
        additionalCostChoice = result.costs.additionalCostChoice;
      }
    } else {
      spellParts.push({ parts: result.parts, index, text, ruleId: result.ruleId });
    }
  }
  // A modal spell is the whole text of its spell (stage P19, CR 700.2): the engine's `SpellText` has
  // `modes` or an `effect`, not both, and two modal lines are two spells. A face that has another
  // spell line beside a modal one reads neither as a whole: the modal line is refused, never merged.
  const modal = spellParts.filter((p) => p.parts.modal !== undefined);
  const refused = spellParts.length > 1 ? modal : [];
  for (const part of refused) {
    const failure = {
      reason: 'notRunnable' as const,
      stoppedAt: part.text,
      closestRule: part.ruleId,
    };
    unparsed.push(
      unparsedAbility(faceIndex, part.index, part.text, { ...failure, recognised: [] }),
    );
  }
  const kept = spellParts.filter((p) => !refused.includes(p)).map((p) => p.parts);
  const spell = kept.length > 0 ? finishSpell(kept) : null;
  const linked = groupLevels(linkExile(abilities));
  for (const at of linked.refused) {
    const line = lineOf[at];
    if (line === undefined) continue;
    const failure = {
      reason: 'notRunnable' as const,
      stoppedAt: line.text,
      closestRule: line.ruleId,
    };
    unparsed.push(
      unparsedAbility(faceIndex, line.index, line.text, { ...failure, recognised: [] }),
    );
  }
  return {
    abilities: linked.abilities,
    spell,
    additionalCosts,
    alternativeCosts,
    additionalCostChoice,
    unparsed,
    lines,
  };
}

/**
 * A line of a spell that starts "If <test>, instead ..." or ends "... instead." (stage P36, D-178, CR 608.2c, 614.1a): "Threshold — If there are
 * seven or more cards in your graveyard, instead search your library for up to three basic land cards, ..." says what replaces the line before it,
 * as "..., instead" does at the end of a sentence in one line. The two lines are one text for the reading, which is what the replacement needs (it replaces one instruction of the
 * same spell); a pair that does not read as one is unread as a whole, as the instead line was alone.
 */
const INSTEAD_LINE = /^If [^\n]+?(?:, instead (?!of\b)|[^\n]* instead\.$)/u;

function joinInsteadLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const last = out.length - 1;
    // The line before is a sentence of its own, ending in a period: a keyword line ("Kicker {2}") is not what the test replaces.
    if (last >= 0 && INSTEAD_LINE.test(line) && /\.$/u.test(out[last] ?? '')) {
      out[last] = `${out[last]} ${line}`;
    } else out.push(line);
  }
  return out;
}

/**
 * A line of a spell that is a test and an instruction about the object the line before it chose (stage P63, D-216, CR 608.2c): "Tap target creature." and
 * "Metalcraft — If you control three or more artifacts, exile that creature." (Dispatch) are two paragraphs of one spell, and "that creature" is the one
 * the first targeted. Each line is read alone, so the second one has nothing to refer to; the pair is read as one text, as the same two sentences
 * of one line are, and only when the second line says "it" or "that <thing>" after the verb of an instruction on an object. A pair that does not read as one
 * is unread as a whole, as the line was alone.
 */
const REFERENCE_LINE =
  /^If [^\n]+?, (?:exile|destroy|return|sacrifice|tap|untap|put) (?:it|that (?:creature|permanent|artifact|land|enchantment|planeswalker))\.$/u;

function joinReferenceLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const last = out.length - 1;
    if (last >= 0 && REFERENCE_LINE.test(line) && /\.$/u.test(out[last] ?? '')) {
      out[last] = `${out[last]} ${line}`;
    } else out.push(line);
  }
  return out;
}

/** The `exile` effects of an effect, nested ones included. */
function exilesIn(effect: Effect): number {
  switch (effect.kind) {
    case 'exile':
      return 1;
    // "you may exile that card from your graveyard" (stage P50, D-207).
    case 'may':
      return exilesIn(effect.effect);
    case 'sequence':
      return effect.effects.reduce((n, e) => n + exilesIn(e), 0);
    case 'conditional':
      return exilesIn(effect.effect) + (effect.else === undefined ? 0 : exilesIn(effect.else));
    default:
      return 0;
  }
}

/**
 * The class level bars of a Class (stage P75, D-235, CR 716.2, 716.2a): an activated ability whose effect is `gainLevel` is the bar of that level ("{1}{R}: Level 2"): it is
 * activated only as a sorcery and only when the Class is at the level before; the abilities that follow it, up to the next bar, are what the Class has from that level on (the
 * engine's `level` ability). The bars go 2, 3, ... in order; a card whose bars do not is refused as a whole, never half grouped.
 */
function groupLevels(input: { abilities: Ability[]; refused: number[] }): {
  abilities: Ability[];
  refused: number[];
} {
  const bars = input.abilities.flatMap((a, i) =>
    a.kind === 'activated' && a.effect.kind === 'gainLevel'
      ? [{ at: i, level: a.effect.level }]
      : [],
  );
  if (bars.length === 0) return input;
  if (bars.some((b, n) => b.level !== n + 2)) {
    return { abilities: input.abilities, refused: [...input.refused, ...bars.map((b) => b.at)] };
  }
  const out: Ability[] = [];
  let group: Ability[] | null = null;
  let level = 1;
  const flush = () => {
    if (group !== null && group.length > 0) out.push({ kind: 'level', level, abilities: group });
    group = null;
  };
  for (const a of input.abilities) {
    if (a.kind === 'activated' && a.effect.kind === 'gainLevel') {
      flush();
      out.push({
        ...a,
        timing: 'sorcery',
        activateOnlyIf: { kind: 'classLevelIs', level: a.effect.level - 1 },
      });
      level = a.effect.level;
      group = [];
    } else if (group !== null) {
      group.push(a);
    } else {
      out.push(a);
    }
  }
  flush();
  return { abilities: out, refused: input.refused };
}

/** Whether the effect moves the cards of the permanent's linked exile (the engine's `linkedExile`, "return the exiled card"; stage P68, D-230), at its own level (not inside a token's ability). */
function movesLinkedExile(effect: Effect): boolean {
  switch (effect.kind) {
    case 'moveToZone':
      return effect.objects.kind === 'linkedExile';
    case 'createToken':
      // D-231 (CR 607.2a): "the exiled card's owner creates an X/X token, where X is its mana value" reads the card.
      return (
        JSON.stringify(effect.controller ?? null).includes('"kind":"linkedExile"') ||
        (effect.token.kind === 'custom' &&
          JSON.stringify(effect.token.ptAmount ?? null).includes('"kind":"linkedExile"'))
      );
    case 'may':
      return movesLinkedExile(effect.effect);
    case 'sequence':
      return effect.effects.some(movesLinkedExile);
    case 'conditional':
      return (
        movesLinkedExile(effect.effect) ||
        (effect.else !== undefined && movesLinkedExile(effect.else))
      );
    default:
      return false;
  }
}

/** Whether the effect moves a card chosen from the permanent's linked exile (the engine's `choose` selector with the zone `exile`). */
function choosesFromLinkedExile(effect: Effect): boolean {
  const text = JSON.stringify(effect);
  return (
    (text.includes('"kind":"choose"') && text.includes('"zone":"exile"')) ||
    movesLinkedExile(effect)
  );
}

/** The effect with each of its `exile` effects marked `linked`. */
function linkedEffect(effect: Effect): Effect {
  switch (effect.kind) {
    case 'exile':
      return { ...effect, linked: true };
    case 'may':
      return { ...effect, effect: linkedEffect(effect.effect) };
    case 'sequence':
      return { ...effect, effects: effect.effects.map(linkedEffect) };
    case 'conditional':
      return {
        ...effect,
        effect: linkedEffect(effect.effect),
        ...(effect.else === undefined ? {} : { else: linkedEffect(effect.else) }),
      };
    default:
      return effect;
  }
}

/**
 * "Imprint — When this creature enters, you may exile target nontoken creature." and "As long as a card exiled with this creature is a
 * creature card, ..." (stage P31, D-140, CR 607.2a): "exiled with ~" names the cards the other ability of the same permanent exiled, so
 * the two are linked. The static ability that reads the cards is kept only when exactly one triggered or activated ability of the face
 * exiles, once; its exile is then marked `linked` (the engine remembers what it exiled). Otherwise the reader is refused (its index in
 * `refused`), never guessed.
 */
function linkExile(abilities: readonly Ability[]): {
  abilities: Ability[];
  refused: number[];
} {
  // The reader is a static ability that takes from the exile (Imprint) or, since stage P50 (D-207), an ability that chooses a card among those the permanent
  // exiled ("Put a card exiled with ~ into its owner's graveyard").
  const readers = abilities.flatMap((a, i) =>
    (a.kind === 'static' && a.static.kind === 'takeFromLinkedExile') ||
    ((a.kind === 'triggered' || a.kind === 'activated') && choosesFromLinkedExile(a.effect))
      ? [i]
      : [],
  );
  if (readers.length === 0) return { abilities: [...abilities], refused: [] };
  const exilers = abilities.flatMap((a, i) =>
    (a.kind === 'triggered' || a.kind === 'activated') && exilesIn(a.effect) > 0 ? [i] : [],
  );
  const [only] = exilers;
  const one = only !== undefined ? abilities[only] : undefined;
  const linkable =
    readers.length === 1 &&
    exilers.length === 1 &&
    one !== undefined &&
    (one.kind === 'triggered' || one.kind === 'activated') &&
    exilesIn(one.effect) === 1;
  if (!linkable) {
    return { abilities: abilities.filter((_, i) => !readers.includes(i)), refused: readers };
  }
  return {
    abilities: abilities.map((a, i) =>
      i === only && (a.kind === 'triggered' || a.kind === 'activated')
        ? { ...a, effect: linkedEffect(a.effect) }
        : a,
    ),
    refused: [],
  };
}
