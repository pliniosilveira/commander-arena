import type {
  Ability,
  AlternativeCost,
  Amount,
  Cost,
  Effect,
  SpellText,
} from '@commander-arena/engine';
import type { UnparsedAbility } from '../../types';
import { type CompileOptions, compileLine } from './compile';
import { unparsedAbility } from './diagnostics';
import { missingFeatures } from './lower/features';
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
  /** Life substituted for each previous command-zone cast tax instance, if printed. */
  readonly commanderTaxLife: number | null;
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
  // Issue 81 (Kher Keep, CR 111.4): "named Kobolds of Kher Keep" ends with the whole name of the card, which a short given name ("Kher") would cut.
  const endsWithWhole = new RegExp(
    `\\bnamed (?:[\\p{Lu}][\\p{L}'’-]* )+of ${escapeRegExp(whole)}(?![\\p{L}\\p{N}])`,
    'u',
  );
  if (endsWithWhole.test(oracleText)) return whole;
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
  const lines =
    face === 'spell'
      ? joinDieTableLines(joinUntapLines(joinReferenceLines(joinInsteadLines(split))))
      : split;
  const ruleSet = buildRuleSet(rules);
  // CR 702.103a: a card with bestow is an Aura while it is attached, so its abilities may speak of "enchanted creature".
  const hostSubtypes =
    faceSubtypes.includes('Aura') || !lines.some((l) => /^bestow \{/iu.test(l))
      ? faceSubtypes
      : [...faceSubtypes, 'Aura'];
  const namedInQuotes = namesItselfInQuotes(oracleText, options);
  const selfName = tokenSelfName(oracleText, options);
  const scope = { targetCount: 0 };
  const abilities: Ability[] = [];
  const spellParts: { parts: SpellParts; index: number; text: string; ruleId: string }[] = [];
  const unparsed: UnparsedAbility[] = [];
  const additionalCosts: Cost[] = [];
  const alternativeCosts: AlternativeCost[] = [];
  let additionalCostChoice: readonly [readonly Cost[], readonly Cost[]] | null = null;
  let commanderTaxLife: number | null = null;
  let xAtMost: Amount | null = null;
  let xAtMostLine: { index: number; text: string } | null = null;
  // The line each ability came from, for a refusal that is found only once every line is read (a linked exile, stage P31).
  const lineOf: { index: number; text: string; ruleId: string }[] = [];
  // CR 721.2, 721.3 (Station): once a station symbol ("12+ | ...") has been read, the lines after it that carry no symbol of their own may be in its striation, which the text does
  // not say; they are refused, never read as abilities that work at every count.
  let afterStationSymbol = false;
  for (const [index, text] of lines.entries()) {
    const symbol = STATION_SYMBOL.exec(text);
    if (symbol === null && afterStationSymbol) {
      unparsed.push(
        unparsedAbility(faceIndex, index, text, {
          reason: 'notRunnable',
          stoppedAt: text,
          closestRule: 'none',
          recognised: [],
        }),
      );
      continue;
    }
    if (
      /^Rather than pay \{2\} for each previous time you've cast ~ from the command zone this game, pay 2 life that many times\.$/u.test(
        text,
      ) &&
      commanderTaxLife === null
    ) {
      commanderTaxLife = 2;
      continue;
    }
    // CR 107.3a, 601.2b (D-2 group, Open the Way): "X can't be greater than the number of players in the game." limits the X announced for the spell: the opponents
    // still in the game and the player (`SpellText.xAtMost`). It is applied to the spell the other lines make, below.
    if (face === 'spell' && X_AT_MOST_PLAYERS.test(text) && xAtMost === null) {
      xAtMost = { kind: 'sum', of: [{ kind: 'opponentCount' }, 1] };
      xAtMostLine = { index, text };
      continue;
    }
    const lineOptions: CompileOptions = {
      rules: ruleSet,
      face,
      faceTypes,
      faceSubtypes: hostSubtypes,
      scope,
      name: options.name,
      namedInQuotes,
      selfName,
    };
    const threshold = symbol === null ? null : Number(symbol[1]);
    const body = symbol === null ? text : (symbol[2] ?? '');
    if (threshold !== null) afterStationSymbol = true;
    // CR 702.177a (issue 345, Redshift): "Exhaust — [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only once." The word is not a flavor word: the ability that follows it
    // is read without it and is marked `exhaust` below, so that it can be activated once, never read as an unlimited one.
    const exhaustWord = /^Exhaust\s+[—–-]\s+(?=[{\p{Lu}])/u.exec(body)?.[0];
    const exhaust = exhaustWord !== undefined;
    const reading = exhaust ? body.slice(exhaustWord.length) : body;
    const asWritten = compileLine(reading, lineOptions);
    // CR 207.2d (D-204): a flavor word has no rules meaning, but no list names them, so the label is taken off only when the line did not
    // read as written, and the line is read again without it. A line that reads today never changes; a wrong strip can only turn an unread
    // line into a read one. If the line still does not read, the diagnostic is the one of the line without its label (it says what is
    // really unread), under the text as written.
    const bare =
      asWritten.ok || asWritten.failure.reason !== 'unrecognised'
        ? reading
        : stripFlavorWord(reading);
    const result = bare === reading ? asWritten : compileLine(bare, lineOptions);
    if (!result.ok) {
      unparsed.push(unparsedAbility(faceIndex, index, text, result.failure));
    } else if (threshold !== null) {
      // CR 721.2a (Station): "N+ | [abilities]" is "as long as this permanent has N or more charge counters on it, it has [abilities]". A symbol on a face that is not a station
      // card, a threshold of 0, a line that is not an ability and one with a power and toughness box (CR 721.2b: not built) are refused as a whole.
      const stationCard = faceSubtypes.includes('Spacecraft') || faceSubtypes.includes('Planet');
      if (result.kind !== 'abilities' || threshold < 1 || !stationCard) {
        unparsed.push(
          unparsedAbility(faceIndex, index, text, {
            reason: 'notRunnable',
            stoppedAt: text,
            closestRule: 'none',
            recognised: [],
          }),
        );
        continue;
      }
      abilities.push({ kind: 'stationLevel', threshold, abilities: [...result.abilities] });
      lineOf.push({ index, text, ruleId: result.ruleId });
    } else if (
      exhaust &&
      (missingFeatures(['ability:exhaust']).length > 0 ||
        result.kind !== 'abilities' ||
        !result.abilities.every((a) => a.kind === 'activated'))
    ) {
      // Only an ordinary activated ability can be activated once: a mana ability or any other line after the word is refused as a whole.
      unparsed.push(
        unparsedAbility(faceIndex, index, text, {
          reason: 'notRunnable',
          stoppedAt: text,
          closestRule: 'none',
          recognised: [],
        }),
      );
    } else if (result.kind === 'abilities') {
      abilities.push(
        ...(exhaust
          ? result.abilities.map((a) =>
              a.kind === 'activated' ? { ...a, exhaust: true as const } : a,
            )
          : result.abilities),
      );
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
  const finished = kept.length > 0 ? finishSpell(kept) : null;
  // The limit on X belongs to a spell that announces an X, and only when the engine runs it; otherwise the line is unread as a whole.
  const limitOk =
    xAtMost !== null &&
    finished?.x === true &&
    missingFeatures(['ability:spellXAtMost']).length === 0;
  const spell =
    limitOk && finished !== null && xAtMost !== null ? { ...finished, xAtMost } : finished;
  if (xAtMost !== null && xAtMostLine !== null && !limitOk) {
    unparsed.push(
      unparsedAbility(faceIndex, xAtMostLine.index, xAtMostLine.text, {
        reason: 'notRunnable',
        stoppedAt: xAtMostLine.text,
        closestRule: 'spell.x-at-most',
        recognised: [],
      }),
    );
  }
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
    commanderTaxLife,
    unparsed,
    lines,
  };
}

/** "12+ | {G}, {T}: Add {G}" (CR 721.2): the station symbol Scryfall writes as the number, a plus sign and a bar, before the ability it gates. */
const STATION_SYMBOL = /^(\d+)\+ \| (.+)$/su;

/**
 * A line of a spell that starts "If <test>, instead ..." or ends "... instead." (stage P36, D-178, CR 608.2c, 614.1a): "Threshold — If there are
 * seven or more cards in your graveyard, instead search your library for up to three basic land cards, ..." says what replaces the line before it,
 * as "..., instead" does at the end of a sentence in one line. The two lines are one text for the reading, which is what the replacement needs (it replaces one instruction of the
 * same spell); a pair that does not read as one is unread as a whole, as the instead line was alone.
 */
/** "X can't be greater than the number of players in the game." (CR 107.3a, 601.2b): a limit on the X of the spell, read as the line of its own it is. */
const X_AT_MOST_PLAYERS = /^X can['’]t be greater than the number of players in the game\.$/u;

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
  /^(?:If [^\n]+?, untap those lands\.|If [^\n]+?, (?:exile|destroy|return|sacrifice|tap|untap|put) (?:it|that (?:creature|permanent|artifact|land|enchantment|planeswalker))\.|That creature gets [^\n]+ instead if [^\n]+\.)$/u;

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

/**
 * A line of a spell that is a test and the "doesn't untap" of the creatures the line before it chose (Hylda deck, group 2, D-517, CR 608.2c, 502.3): "Tap X target creatures." and
 * "Ferocious — If you control a creature with power 4 or greater, those creatures don't untap during their controllers' next untap steps." (Icy Blast) are two paragraphs of one spell,
 * and "those creatures" are the ones the first targeted. As for `REFERENCE_LINE`, the pair is read as one text, and only when the second line says "it", "that creature" or "those
 * creatures" before "doesn't untap" or "don't untap"; a pair that does not read as one is unread as a whole, as the line was alone.
 */
const UNTAP_LINE =
  /^If [^\n]+?, (?:it|that creature|those creatures) (?:doesn't|don't) untap during [^\n]*? next untap steps?\.$/u;

function joinUntapLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const last = out.length - 1;
    if (last >= 0 && UNTAP_LINE.test(line) && /\.$/u.test(out[last] ?? '')) {
      out[last] = `${out[last]} ${line}`;
    } else out.push(line);
  }
  return out;
}

/**
 * The rows of the results table of a die roll (Hylda deck, group 2, D-525, CR 706.3a, 706.3b): "Roll a d20." and the lines "1—9 | Tap all creatures your opponents control." that
 * follow it are one ability, so they are read as one text, the roll and then each row (`IrSentence.dieRow`). A row line that does not follow the roll line is not joined (and is not read).
 */
const DIE_ROLL_LINE = /^Roll a d\d+\.(?: |$)/u;
const DIE_ROW_LINE = /^\d+(?:[—–-]\d+)? \| /u;

function joinDieTableLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const last = out.length - 1;
    if (last >= 0 && DIE_ROW_LINE.test(line) && DIE_ROLL_LINE.test(out[last] ?? '')) {
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
  return choosesFromExile(effect) || movesLinkedExile(effect);
}

/**
 * Whether the node holds, at any depth, a `choose` selector of cards in exile that is not a choice among the cards the effect before it exiled (`fromMoved`: "put a permanent card from
 * among them onto the battlefield", Death Toll deck), which reads no linked exile.
 */
function choosesFromExile(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(choosesFromExile);
  if (typeof node !== 'object' || node === null) return false;
  const o = node as { kind?: unknown; filter?: { zone?: unknown }; fromMoved?: unknown };
  if (o.kind === 'choose' && o.filter?.zone === 'exile' && o.fromMoved !== true) return true;
  return Object.values(node).some(choosesFromExile);
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
    ((a.kind === 'triggered' || a.kind === 'activated') &&
      (choosesFromLinkedExile(a.effect) ||
        // Lorehold group 2 (CR 607.2a): "Choose target card exiled with ~": a target slot of the cards the permanent exiled.
        JSON.stringify(a.targets ?? null).includes('"exiledWithSource":true')))
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
