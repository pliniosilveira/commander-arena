/**
 * Where the small choice popover of a card goes (issue 85): the "Cast / Cycling" bubble that
 * opens when a card has several things to do, and the mana choice of a source. It opens under the
 * card when there is room, above it when under does not fit (a hand card sits at the foot of the
 * window), and is always clamped inside the box it is drawn in, so it can never be cut off.
 * Pure, so the rule is unit tested without a browser.
 */

export interface PopoverRect {
  readonly left: number;
  /** The top edge of what the popover points at. */
  readonly top: number;
  /** The bottom edge of what the popover points at. */
  readonly bottom: number;
}

export interface PopoverSize {
  readonly width: number;
  readonly height: number;
}

export interface PopoverPlace {
  readonly left: number;
  readonly top: number;
  readonly side: 'below' | 'above' | 'inside';
}

/** The space kept free between the popover and the box edge, and between it and the card. */
export const POPOVER_MARGIN = 4;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/**
 * The position of a popover `size` pointing at `anchor`, inside a box of `bounds` (all in the
 * box's own coordinates). Below the card if the whole popover fits there, else above it, else
 * the side with more room, pushed in until it fits (and pinned to the top edge when it is taller
 * than the box). The left edge follows the card's, pushed in from either side.
 */
export function placePopover(
  anchor: PopoverRect,
  size: PopoverSize,
  bounds: PopoverSize,
  margin: number = POPOVER_MARGIN,
): PopoverPlace {
  const left = clamp(anchor.left, margin, Math.max(margin, bounds.width - size.width - margin));
  const below = anchor.bottom + margin;
  const above = anchor.top - margin - size.height;
  const lowest = Math.max(margin, bounds.height - margin - size.height);
  if (below <= lowest) return { left, top: below, side: 'below' };
  // Above, unless the card itself is out of the box below (then the nearest place that shows).
  if (above >= margin) return { left, top: Math.min(above, lowest), side: 'above' };
  // Neither side has the room for the whole popover: it covers the card, but stays on screen.
  return { left, top: lowest, side: 'inside' };
}
