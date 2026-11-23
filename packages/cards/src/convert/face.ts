import type { Ability, CardFace, Characteristics, Color } from '@commander-arena/engine';
import type { StoredFace, UnparsedAbility } from '../types';
import { convertManaCost } from './mana-cost';
import { convertCount, convertPt } from './numbers';
import { intrinsicAbilities } from './parser/intrinsic';
import { parseFaceText } from './parser/parse-face';
import { chapterNumbers } from './parser/roman';
import { DEFAULT_RULES, DEFAULT_SPELL_RULES } from './parser/rules/index';
import type { GrammarRule, SpellRule } from './parser/types';
import { parseTypeLine } from './type-line';

export interface ConvertedCharacteristics {
  /** Everything but the abilities: what a fixture can be compared with. */
  readonly characteristics: Characteristics;
  /** Problems with the printed data that make the card unsupported. */
  readonly reasons: string[];
}

/** The printed characteristics of one face (CR 109.3), converted from Scryfall's strings. */
export function convertCharacteristics(face: StoredFace): ConvertedCharacteristics {
  const reasons: string[] = [];
  const typeLine = parseTypeLine(face.typeLine);
  for (const word of typeLine.unknown) reasons.push(`unsupported type or supertype "${word}"`);
  const cost = convertManaCost(face.manaCost);
  reasons.push(...cost.problems);
  const power = convertPt(face.power, 'power');
  const toughness = convertPt(face.toughness, 'toughness');
  // Galadriel deck, group 1 (Nissa, Steward of Elements; CR 306.5b, 107.3m): a planeswalker whose printed loyalty is X enters with X loyalty counters, X being the one announced for
  // its spell. Its printed loyalty is 0 and `convertFace` gives it the replacement "enters with X loyalty counters" (the engine's `entersWithCounters`).
  const loyalty =
    face.loyalty === 'X' && typeLine.types.includes('planeswalker')
      ? { value: 0, problems: [] }
      : convertCount(face.loyalty, 'loyalty');
  const defense = convertCount(face.defense, 'defense');
  reasons.push(...power.problems, ...toughness.problems, ...loyalty.problems, ...defense.problems);
  const colors: Color[] = [...face.colors];
  return {
    characteristics: {
      name: face.name,
      manaCost: cost.symbols,
      supertypes: typeLine.supertypes,
      types: typeLine.types,
      subtypes: typeLine.subtypes,
      colors,
      power: power.value,
      toughness: toughness.value,
      loyalty: loyalty.value,
      defense: defense.value,
      oracleText: face.oracleText,
    },
    reasons,
  };
}

/**
 * A Saga's final chapter number (CR 714.2d: the greatest chapter number among its chapter
 * abilities), read from the chapter lines of the text, so it is the printed one even when a line
 * did not parse. Null for a face that is not a Saga or has no chapter line; `validateCard` then
 * says what is missing, and checks that every chapter up to it is there exactly once.
 */
function finalChapterOf(subtypes: readonly string[], lines: readonly string[]): number | null {
  if (!subtypes.includes('Saga')) return null;
  const numbers = lines.flatMap((line) => chapterNumbers(line) ?? []);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

/** "This permanent enters with a number of loyalty counters on it equal to its printed loyalty number" where that number is X (CR 306.5b, 107.3m). */
const X_LOYALTY_REPLACEMENT: Ability = {
  kind: 'replacement',
  replacement: { kind: 'entersWithCounters', counter: 'loyalty', count: { kind: 'x' } },
};

/**
 * CR 721.2b, 721.2c (Station): a station card's printed power and toughness belong to one station symbol, the one whose striation holds the box, and the card has none of its own
 * anywhere else. Scryfall gives the numbers as the face's power and toughness and names the symbol only in the reminder text of the Station keyword ("It's an artifact creature at 7+."),
 * so the threshold is read from there. `box` is that threshold; `problem` says why the box cannot be placed, which makes the card unsupported (never a card that has the symbol
 * but not the creature).
 */
function stationBox(
  stored: StoredFace,
  characteristics: Characteristics,
): { readonly box: number } | { readonly problem: string } | null {
  const isStation =
    characteristics.subtypes.includes('Spacecraft') || characteristics.subtypes.includes('Planet');
  // A Spacecraft that is printed as a creature has its power and toughness always (it is not made one by a symbol).
  if (
    !isStation ||
    characteristics.types.includes('creature') ||
    (stored.power === null && stored.toughness === null)
  )
    return null;
  const said = [...stored.oracleText.matchAll(/creature at (\d+)\+/giu)];
  const only = said.length === 1 ? said[0] : undefined;
  if (only?.[1] === undefined) {
    return {
      problem:
        'a station card with a power and toughness box whose reminder text does not name the one symbol it belongs to (CR 721.2b)',
    };
  }
  return { box: Number(only[1]) };
}

/** A station symbol that holds the power and toughness box (CR 721.2b): the creature type in addition to the others (layer 4), the base power and toughness (layer 7b). */
function withStationBox(
  abilities: readonly Ability[],
  threshold: number,
  power: number,
  toughness: number,
): readonly Ability[] | null {
  const symbols = abilities.filter((a) => a.kind === 'stationLevel' && a.threshold === threshold);
  if (symbols.length !== 1) return null;
  return abilities.map((a) =>
    a.kind === 'stationLevel' && a.threshold === threshold
      ? {
          ...a,
          abilities: [
            ...a.abilities,
            {
              kind: 'static',
              static: {
                kind: 'setTypes',
                subject: { kind: 'this' },
                additive: true,
                types: ['creature'],
              },
            },
            {
              kind: 'static',
              static: { kind: 'setPt', subject: { kind: 'this' }, power, toughness },
            },
          ],
        }
      : a,
  );
}

export interface ConvertedFace {
  readonly face: CardFace;
  readonly unparsed: UnparsedAbility[];
  readonly reasons: string[];
}

/**
 * Converts one face: characteristics, then the abilities. Intrinsic land-type mana abilities come
 * first (CR 305.6), then every ability line that a rule consumed completely. Lines no rule
 * consumed are returned as `unparsed` and are NOT in the face. On an instant or sorcery the lines
 * the spell rules read become `spell` (its effect); on any other face `spell` is null, and an
 * instant or sorcery whose text did not parse has no spell and is unsupported.
 */
export function convertFace(
  stored: StoredFace,
  faceIndex: number,
  rules: readonly GrammarRule[] = DEFAULT_RULES,
  spellRules: readonly SpellRule[] = DEFAULT_SPELL_RULES,
): ConvertedFace {
  const { characteristics, reasons } = convertCharacteristics(stored);
  const isSpellCard =
    characteristics.types.includes('instant') || characteristics.types.includes('sorcery');
  const parsed = parseFaceText(
    stored.oracleText,
    {
      name: stored.name,
      legendary: characteristics.supertypes.includes('legendary'),
      creature: characteristics.types.includes('creature'),
    },
    faceIndex,
    rules,
    isSpellCard ? spellRules : [],
    characteristics.types,
    characteristics.subtypes,
  );
  // CR 721.2b, 721.2c: the box of a station card is the creature its symbol makes, not printed power and toughness.
  const box = stationBox(stored, characteristics);
  const reasonsBefore = reasons.length;
  let boxed: readonly Ability[] | null = null;
  if (box !== null && 'problem' in box) reasons.push(box.problem);
  else if (
    box !== null &&
    typeof characteristics.power === 'number' &&
    typeof characteristics.toughness === 'number'
  ) {
    boxed = withStationBox(
      parsed.abilities,
      box.box,
      characteristics.power,
      characteristics.toughness,
    );
    if (boxed === null) {
      reasons.push(
        `the station symbol ${box.box}+ that holds the power and toughness box was not read (CR 721.2b)`,
      );
    }
  }
  if (box !== null && !('problem' in box) && boxed === null && reasons.length === reasonsBefore) {
    reasons.push(
      'the power and toughness box of a station card is not a pair of numbers (CR 721.2b)',
    );
  }
  const abilities = [
    ...intrinsicAbilities(characteristics.types, characteristics.subtypes),
    // CR 306.5b, 107.3m: the intrinsic ability of a planeswalker with an X in its loyalty.
    ...(stored.loyalty === 'X' && characteristics.types.includes('planeswalker')
      ? [X_LOYALTY_REPLACEMENT]
      : []),
    ...(boxed ?? parsed.abilities),
  ];
  const finalChapter = finalChapterOf(characteristics.subtypes, parsed.lines);
  return {
    face: {
      ...characteristics,
      ...(boxed === null ? {} : { power: null, toughness: null }),
      abilities,
      ...(parsed.commanderTaxLife === null ? {} : { commanderTaxLife: parsed.commanderTaxLife }),
      spell: parsed.spell,
      ...(finalChapter === null ? {} : { finalChapter }),
      ...(parsed.additionalCosts.length === 0 ? {} : { additionalCosts: parsed.additionalCosts }),
      ...(parsed.additionalCostChoice === null
        ? {}
        : { additionalCostChoice: parsed.additionalCostChoice }),
      ...(parsed.alternativeCosts.length === 0
        ? {}
        : { alternativeCosts: parsed.alternativeCosts }),
    },
    unparsed: [...parsed.unparsed],
    reasons,
  };
}
