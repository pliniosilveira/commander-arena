/**
 * Which cards a sideways scroller hides. The rows of the field and the hand keep half a view of
 * empty room at each end (board.css `.board-row-scroll`, `.board-hand-fan`), so the scroll extent
 * says nothing about cards: the question is whether a card lies outside the view.
 */

/** The horizontal extent of a box, in the same coordinates as the others (client pixels). */
export interface Span {
  readonly left: number;
  readonly right: number;
}

/** How many cards stick out of the view at each side, wholly or in part. */
export interface HiddenCards {
  readonly left: number;
  readonly right: number;
}

export const NONE_HIDDEN: HiddenCards = { left: 0, right: 0 };

/** A card this many pixels past the edge is still shown: rounding and the hover lift are not "hidden". */
const TOLERANCE = 2;

export function hiddenCards(view: Span, cards: readonly Span[]): HiddenCards {
  let left = 0;
  let right = 0;
  for (const card of cards) {
    if (card.left < view.left - TOLERANCE) left += 1;
    if (card.right > view.right + TOLERANCE) right += 1;
  }
  return left === 0 && right === 0 ? NONE_HIDDEN : { left, right };
}
