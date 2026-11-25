/**
 * The shape of a stack of equal permanents on the battlefield: one card drawn behind the front one for each other copy, each a
 * step to the right and a little higher, so the stack shows how many cards it holds. Pure, so the numbers are unit tested and
 * the row layout (`layout.ts`) reserves the room the stack takes beside its tile.
 */

/** The front card of a stack is this much smaller than its tile, in the tile's own shape: the room the cards behind rise into. */
export const STACK_FRONT_RIGHT = 12;
export const STACK_FRONT_TOP = 11;

/** How much of each card behind shows, in pixels, while the stack is short. */
const STEP = 9;
/** A long stack closes up, but never closer than this: under it a card's edge is no longer told from the next. */
const MIN_STEP = 3;
/** The widest the cards behind fan out, whatever their number. */
const SPREAD = 72;
/** The most cards drawn behind the front one (the spread at the smallest step); the count badge always says the real number. */
export const MAX_BEHIND = SPREAD / MIN_STEP;

export interface StackShape {
  /** The cards drawn behind the front one. */
  readonly behind: number;
  /** Each card behind stands this far right of the one in front of it, and this much higher. */
  readonly dx: number;
  readonly dy: number;
  /** The width the stack takes past its tile's own box. */
  readonly extraW: number;
}

export function stackShape(count: number): StackShape {
  const behind = Math.max(0, Math.min(count - 1, MAX_BEHIND));
  if (behind === 0) return { behind: 0, dx: 0, dy: 0, extraW: 0 };
  const dx = Math.max(MIN_STEP, Math.min(STEP, Math.floor(SPREAD / behind)));
  return {
    behind,
    dx,
    // The cards behind share the height the front card leaves free, half of it at most each.
    dy: Math.min(STACK_FRONT_TOP / 2, STACK_FRONT_TOP / behind),
    extraW: Math.max(0, behind * dx - STACK_FRONT_RIGHT),
  };
}
