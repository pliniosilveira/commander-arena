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
  const abilities = [
    ...intrinsicAbilities(characteristics.types, characteristics.subtypes),
    // CR 306.5b, 107.3m: the intrinsic ability of a planeswalker with an X in its loyalty.
    ...(stored.loyalty === 'X' && characteristics.types.includes('planeswalker')
      ? [X_LOYALTY_REPLACEMENT]
      : []),
    ...parsed.abilities,
  ];
  const finalChapter = finalChapterOf(characteristics.subtypes, parsed.lines);
  return {
    face: {
      ...characteristics,
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
