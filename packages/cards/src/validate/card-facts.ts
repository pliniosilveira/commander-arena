/**
 * Facts about a stored card that Commander deck construction needs (CR 903.3, 903.4, 903.5).
 * Type, supertype and subtype come from the FRONT face's type line: a double-faced card is judged
 * by the face that is up in the deck (Scryfall reports `legendary` etc. per face), while color
 * identity includes every face and is read from Scryfall's `colorIdentity` (CR 903.4d).
 */
import type { ColorLetter, StoredCard, StoredFace } from '../types';

const COLOR_ORDER: readonly ColorLetter[] = ['W', 'U', 'B', 'R', 'G'];

const BASIC_LAND_TYPES: readonly string[] = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

const BASIC_TYPE_COLOR: Readonly<Record<string, ColorLetter>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

export interface ParsedTypeLine {
  /** Supertypes and card types before the dash, for example `Legendary`, `Artifact`, `Creature`. */
  readonly types: readonly string[];
  /** Subtypes after the dash, for example `Vehicle`, `Time`, `Lord`, `Doctor`. */
  readonly subtypes: readonly string[];
}

export function parseTypeLine(typeLine: string): ParsedTypeLine {
  const dash = typeLine.search(/\s[—–]\s|[—–]/);
  const head = dash === -1 ? typeLine : typeLine.slice(0, dash);
  const tail = dash === -1 ? '' : typeLine.slice(dash).replace(/^\s*[—–]\s*/, '');
  const split = (text: string): string[] => text.split(/\s+/).filter((word) => word.length > 0);
  return { types: split(head), subtypes: split(tail) };
}

export function frontFace(card: StoredCard): StoredFace | null {
  return card.faces[0] ?? null;
}

export function frontType(card: StoredCard): ParsedTypeLine {
  const face = frontFace(card);
  return parseTypeLine(face ? face.typeLine : '');
}

export function oracleTextOf(card: StoredCard): string {
  return card.faces.map((face) => face.oracleText).join('\n');
}

/** Basic lands may appear any number of times (CR 903.5b); the supertype is `Basic`. */
export function isBasicLand(card: StoredCard): boolean {
  const { types } = frontType(card);
  return types.includes('Basic') && types.includes('Land');
}

export function isLegendary(card: StoredCard): boolean {
  return frontType(card).types.includes('Legendary');
}

export function isBackground(card: StoredCard): boolean {
  const { types, subtypes } = frontType(card);
  return (
    types.includes('Legendary') && types.includes('Enchantment') && subtypes.includes('Background')
  );
}

/** CR 903.3a: some cards say they "can be your commander". */
export function canBeYourCommanderByText(card: StoredCard): boolean {
  const face = frontFace(card);
  return face !== null && /\bcan be your commander\b/i.test(face.oracleText);
}

/**
 * CR 903.3: a commander is a legendary creature card, a legendary Vehicle card, or a legendary
 * Spacecraft card with one or more power/toughness boxes; CR 903.3a adds cards whose own text says
 * they can be your commander. A legendary Background is NOT eligible alone (CR 702.124k).
 */
export function isEligibleCommander(card: StoredCard): boolean {
  if (canBeYourCommanderByText(card)) return true;
  const face = frontFace(card);
  if (face === null) return false;
  const { types, subtypes } = parseTypeLine(face.typeLine);
  if (!types.includes('Legendary')) return false;
  if (types.includes('Creature')) return true;
  const hasPowerToughness = face.power !== null && face.toughness !== null;
  if (subtypes.includes('Vehicle')) return true;
  return subtypes.includes('Spacecraft') && hasPowerToughness;
}

/** Colors in a card's color identity, in WUBRG order without duplicates. */
function sortColors(colors: Iterable<ColorLetter>): ColorLetter[] {
  const set = new Set(colors);
  return COLOR_ORDER.filter((color) => set.has(color));
}

/** CR 702.124c and 903.4: with two commanders the identities are combined. */
export function colorIdentityOf(commanders: readonly StoredCard[]): ColorLetter[] {
  return sortColors(commanders.flatMap((card) => card.colorIdentity));
}

/**
 * Colors by which a card breaks the deck's identity (CR 903.5c), plus colors it could produce as a
 * basic-land-typed card (CR 903.5d). Empty when the card may be in the deck.
 */
export function offIdentityColors(
  card: StoredCard,
  identity: readonly ColorLetter[],
): ColorLetter[] {
  const allowed = new Set(identity);
  const off = new Set<ColorLetter>(card.colorIdentity.filter((color) => !allowed.has(color)));
  const { subtypes, types } = frontType(card);
  const basicTypes = subtypes.filter((subtype) => BASIC_LAND_TYPES.includes(subtype));
  if (types.includes('Land') && basicTypes.length > 0) {
    // Each basic land type carries its intrinsic mana ability; Scryfall also lists produced mana.
    const produced = basicTypes.flatMap((subtype) => BASIC_TYPE_COLOR[subtype] ?? []);
    const listed = COLOR_ORDER.filter((color) => card.producedMana.includes(color));
    for (const color of [...produced, ...listed]) {
      if (!allowed.has(color)) off.add(color);
    }
  }
  return sortColors(off);
}
