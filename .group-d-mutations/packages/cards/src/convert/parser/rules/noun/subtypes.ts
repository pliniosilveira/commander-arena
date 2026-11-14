/**
 * Subtype words in a noun phrase (stage P15, CR 205.3): "Elf creatures", "Plant creature", "Forest",
 * "Equipment you control", "Treasures". A subtype is a capitalized word in Oracle text (CR 205.3b:
 * subtypes of every card type are listed after the dash), so a word is read as one only when it is
 * a listed subtype, in the singular or, with one regular plural ending, in the plural; any other
 * capitalized word is not read (the same rule as `creatureTypeOf`, which this widens to the three
 * other lists of CR 205.3g, 205.3h and 205.3i that a rule line names: the artifact, enchantment and
 * land types an effect or a filter asks about). The lists are copied from the repository's CR text
 * (a test compares them).
 */
import { BASIC_LAND_TYPES } from '@commander-arena/engine';
import { fail, type Parser, pattern } from '../../combinators';
import { MULTIWORD_FORMS, readCreatureType } from './creature-types';

/**
 * Artifact types (CR 205.3g), enchantment types (CR 205.3h) and land types (CR 205.3i) that a rule
 * line can ask about. The CR lists more of each (Attraction, Contraption, Background, Cartouche,
 * Planet, ...): a type that no effect of the corpus names as a group of permanents is not listed, and
 * "Urza's" is left out because of its apostrophe.
 */
export const OTHER_SUBTYPES: ReadonlySet<string> = new Set([
  // 205.3g
  'Blood',
  'Clue',
  'Equipment',
  'Food',
  'Fortification',
  'Gold',
  'Map',
  'Powerstone',
  'Treasure',
  'Vehicle',
  // 205.3h
  'Aura',
  'Curse',
  'Saga',
  'Shrine',
  // 205.3i
  ...Object.keys(BASIC_LAND_TYPES),
  'Cave',
  'Desert',
  'Gate',
  'Lair',
  'Locus',
  'Mine',
  'Sphere',
  'Tower',
  'Town',
]);

/**
 * The planeswalker types (CR 205.3j, stage P34, D-152): "Return target Dragon creature card or Ugin planeswalker card from your graveyard to
 * your hand." Copied from the CR text in `docs/rules/` (a test compares them).
 */
export const PLANESWALKER_TYPES: ReadonlySet<string> = new Set([
  'Ajani',
  'Aminatou',
  'Angrath',
  'Arlinn',
  'Ashiok',
  'Bahamut',
  'Basri',
  'Bolas',
  'Calix',
  'Chandra',
  'Comet',
  'Dack',
  'Dakkon',
  'Daretti',
  'Davriel',
  'Dellian',
  'Dihada',
  'Domri',
  'Dovin',
  'Ellywick',
  'Elminster',
  'Elspeth',
  'Estrid',
  'Freyalise',
  'Garruk',
  'Gideon',
  'Grist',
  'Guff',
  'Huatli',
  'Jace',
  'Jared',
  'Jaya',
  'Jeska',
  'Kaito',
  'Karn',
  'Kasmina',
  'Kaya',
  'Kiora',
  'Koth',
  'Liliana',
  'Lolth',
  'Lukka',
  'Minsc',
  'Mordenkainen',
  'Nahiri',
  'Narset',
  'Niko',
  'Nissa',
  'Nixilis',
  'Oko',
  'Quintorius',
  'Ral',
  'Rowan',
  'Saheeli',
  'Samut',
  'Sarkhan',
  'Serra',
  'Sivitri',
  'Sorin',
  'Szat',
  'Tamiyo',
  'Tasha',
  'Teferi',
  'Teyo',
  'Tezzeret',
  'Tibalt',
  'Tyvar',
  'Ugin',
  'Urza',
  'Venser',
  'Vivien',
  'Vraska',
  'Vronos',
  'Will',
  'Windgrace',
  'Wrenn',
  'Xenagos',
  'Yanggu',
  'Yanling',
  'Zariel',
]);

/** Artifact, enchantment and land subtypes that are their own plural, so the word alone does not say how many. */
const INVARIANT: ReadonlySet<string> = new Set(['Equipment', 'Plains']);

export interface SubtypeWord {
  /** The singular subtype ("Elf" for "Elves"). */
  readonly subtype: string;
  /** True for a plural form, false for the singular, null when the word is both. */
  readonly plural: boolean | null;
}

/**
 * The subtype a capitalized word names, or undefined. A creature type is read as `readCreatureType` reads it (the
 * singular, a plural of the ending rules, an irregular plural or a type that is its own plural, stage P29); an other
 * type is read as listed or with an `s` or `es` ending that leaves a listed type.
 */
export function subtypeOf(word: string): SubtypeWord | undefined {
  const creature = readCreatureType(word);
  if (creature !== undefined) return { subtype: creature.type, plural: creature.plural };
  if (OTHER_SUBTYPES.has(word) || PLANESWALKER_TYPES.has(word)) {
    return { subtype: word, plural: INVARIANT.has(word) ? null : false };
  }
  const stems = [
    word.endsWith('s') ? word.slice(0, -1) : '',
    word.endsWith('es') ? word.slice(0, -2) : '',
  ].filter((s) => s !== '' && OTHER_SUBTYPES.has(s));
  const [stem] = [...new Set(stems)];
  return stem === undefined || new Set(stems).size !== 1
    ? undefined
    : { subtype: stem, plural: true };
}

const WORD = pattern(/[A-Z][\p{L}’'-]*/u);

/**
 * A capitalized word that names a subtype, with the number it says. A type of more than one word ("Time Lord", "Time
 * Lords", stage P29) is read whole, before the single words.
 */
export const SUBTYPE_WORD_NUMBERED: Parser<SubtypeWord> = (ctx, pos) => {
  for (const form of MULTIWORD_FORMS) {
    if (!ctx.text.startsWith(form, pos)) continue;
    const next = ctx.text.charAt(pos + form.length);
    const found = subtypeOf(form);
    if (found !== undefined && !/[\p{L}\p{N}’'-]/u.test(next)) {
      return { ok: true, value: found, pos: pos + form.length };
    }
  }
  const word = WORD(ctx, pos);
  if (!word.ok) return word;
  const found = subtypeOf(word.value[0]);
  return found === undefined ? fail(ctx, pos) : { ok: true, value: found, pos: word.pos };
};
