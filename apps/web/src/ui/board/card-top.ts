/**
 * The top of the printed card as the picture of a battlefield tile: the card image cut just under
 * its type line, so the title, the mana cost, the art and the type line are the printed ones and
 * the rules text and the printed power and toughness are left off (the tile's own marks show the
 * current ones). Pure, so which cards get it is unit tested without a DOM.
 */
import type { ObjectView } from '@commander-arena/engine';
import { isFaceDownPermanent } from '../../game/face-down-text';

/** Scryfall's `normal` card image, in pixels. */
const IMAGE_W = 488;
const IMAGE_H = 680;

/**
 * Where the type line ends on the regular modern frame, as a share of the card's height. Measured
 * on five cards the owner supplied (a creature, an enchantment, a land, a multicoloured card).
 */
const REGULAR_CUT = 0.632;
/** A planeswalker's type line stands higher (measured on one modern planeswalker). */
const PLANESWALKER_CUT = 0.55;

/** Width over height of a tile that shows a regular card down to its type line. */
export const CARD_TOP_ASPECT = IMAGE_W / (IMAGE_H * REGULAR_CUT);

export interface CardTop {
  /**
   * The share of the tile's height the card's top takes. Under 1 for a frame whose type line
   * stands higher than the regular one: the rest of the tile is covered, never rules text.
   */
  readonly cover: number;
}

const REGULAR: CardTop = { cover: 1 };
const PLANESWALKER: CardTop = { cover: PLANESWALKER_CUT / REGULAR_CUT };

/** Subtypes whose frame has its art at the side, so the top of the card is half rules text. */
const SIDE_ART: ReadonlySet<string> = new Set(['Saga', 'Class', 'Case']);

/**
 * How the top of an object's card is drawn on its tile, or null when the tile keeps the drawn frame
 * over the art alone: a face-down permanent, a token that is not a copy of a card (its own frame
 * has the type line elsewhere), and the frames with no type line under the art (a split card or a
 * Room, a Saga, a Class, a Case, a battle, a melded permanent).
 */
export function cardTopOf(o: ObjectView): CardTop | null {
  if (isFaceDownPermanent(o)) return null;
  if (o.isToken && (o.tokenDefinition === undefined || o.tokenDefinition.manaCost === null))
    return null;
  if (o.meld !== undefined) return null;
  if (o.layout === 'split' || o.layout === 'saga' || o.layout === 'class') return null;
  if (o.types.includes('battle')) return null;
  if (o.subtypes.some((s) => SIDE_ART.has(s))) return null;
  return o.types.includes('planeswalker') ? PLANESWALKER : REGULAR;
}

/** The height of a tile `w` wide that shows a regular card's top. */
export function cardTopHeight(w: number): number {
  return Math.round(w / CARD_TOP_ASPECT);
}
