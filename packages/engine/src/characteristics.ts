/**
 * Characteristics (CR 109.3): name, mana cost, color, color indicator, card type, subtype,
 * supertype, rules text, abilities, power, toughness, loyalty, defense, hand modifier, life
 * modifier. Base characteristics live on the card definition; current characteristics are
 * derived through the layer system (CR 613) and never stored on an object (SPEC 4.2).
 */

import { PLANESWALKER_TYPES } from './data/planeswalker-types';

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];

export const CARD_TYPES = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'instant',
  'kindred',
  'land',
  'planeswalker',
  'sorcery',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const SUPERTYPES = ['basic', 'legendary', 'snow', 'world'] as const;
export type Supertype = (typeof SUPERTYPES)[number];

/** Subtypes are open-ended (creature types, land types, Equipment, Aura, Saga, ...). */
export type Subtype = string;

export const PERMANENT_TYPES: readonly CardType[] = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
];

export function isPermanentType(type: CardType): boolean {
  return PERMANENT_TYPES.includes(type);
}

export const BASIC_LAND_TYPES: Readonly<Record<string, Color>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

export interface TypeLine {
  readonly supertypes: readonly Supertype[];
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
}

/** Power or toughness as printed: a number, or a "*"-style value defined by an ability. */
export type PtValue = number | '*';

export interface Characteristics extends TypeLine {
  readonly name: string;
  /** Mana cost as symbols, e.g. ["1", "G"]. Null for lands and cards with no mana cost (CR 202.1). */
  readonly manaCost: readonly string[] | null;
  readonly colors: readonly Color[];
  readonly power: PtValue | null;
  readonly toughness: PtValue | null;
  readonly loyalty: number | null;
  readonly defense: number | null;
  readonly oracleText: string;
}

/**
 * Subtypes that are not creature types: artifact types (CR 205.3g), enchantment types (205.3h),
 * land types (205.3i) and spell types (205.3k). An effect that sets creature types (CR 205.1a,
 * "becomes a Frog") leaves these alone, and the engine accepts only creature types in such an
 * effect. Planeswalker types (CR 205.3j) are the generated table `PLANESWALKER_TYPES` (D-200).
 */
const NON_CREATURE_SUBTYPES: ReadonlySet<Subtype> = new Set([
  ...['Attraction', 'Blood', 'Bobblehead', 'Book', 'Clue', 'Contraption', 'Equipment'],
  ...['Food', 'Fortification', 'Gold', 'Heartwood', 'Incubator', 'Infinity', 'Junk', 'Lander'],
  ...['Map', 'Mutagen', 'Powerstone', 'Spacecraft', 'Stone', 'Treasure', 'Vehicle', 'Vibranium'],
  ...['Aura', 'Background', 'Cartouche', 'Case', 'Class', 'Curse', 'Plan', 'Role', 'Room', 'Rune'],
  ...['Saga', 'Shard', 'Shrine'],
  ...['Cave', 'Desert', 'Forest', 'Gate', 'Island', 'Lair', 'Locus', 'Mine', 'Mountain', 'Plains'],
  ...['Planet', 'Power-Plant', 'Sphere', 'Swamp', 'Tower', 'Town', 'Urza’s'],
  ...['Adventure', 'Arcane', 'Lesson', 'Omen', 'Trap'],
  ...PLANESWALKER_TYPES,
]);

/** Whether `subtype` belongs to a card type other than creature and kindred. */
export function isNonCreatureSubtype(subtype: Subtype): boolean {
  return NON_CREATURE_SUBTYPES.has(subtype);
}
