/**
 * Row and hand sizing (A19). The CSS draws what these numbers say; they are pure so the
 * shrink / group / scroll decision is unit tested.
 */
import type { ObjectView } from '@commander-arena/engine';
import { groupEqual, type TileEntry } from './group';

export interface RowSpec {
  /** Tile height in pixels (fixed by the row's available height). */
  readonly tileH: number;
  /** Width at which a tile is drawn while the row has room. */
  readonly preferredW: number;
  /** Narrowest tile worth drawing before the row scrolls. */
  readonly minW: number;
  readonly gap: number;
}

export interface RowLayout {
  readonly entries: readonly TileEntry[];
  readonly tileW: number;
  /** Equal permanents were collapsed into at least one group. */
  readonly grouped: boolean;
  /** Still wider than the row after grouping: the row scrolls horizontally. */
  readonly overflow: boolean;
}

/** The widest tile width in [minW, preferredW] at which `count` tiles fit, and whether even that overflows. */
export function fitTiles(
  count: number,
  width: number,
  spec: RowSpec,
): { tileW: number; overflow: boolean } {
  if (count === 0) return { tileW: spec.preferredW, overflow: false };
  const ideal = Math.floor((width - (count - 1) * spec.gap) / count);
  const tileW = Math.max(spec.minW, Math.min(spec.preferredW, ideal));
  return { tileW, overflow: count * tileW + (count - 1) * spec.gap > width + 0.5 };
}

/**
 * Decides one row. Three or more equal permanents always stand as one group; two do only when the
 * row cannot keep the preferred tile size without it (issue 368: a group keeps the other cards
 * readable, so it comes before shrinking). Then the tiles shrink to the minimum, then the row
 * scrolls. A tapped tile takes the room of an untapped one (it is tilted, not turned). `width` null
 * means "not measured yet" (server render): draw at preferred size.
 */
export function layoutRow(
  objects: readonly ObjectView[],
  width: number | null,
  spec: RowSpec,
  extraKey?: (o: ObjectView) => string,
): RowLayout {
  const piles = groupEqual(objects, extraKey, 3);
  if (width === null) {
    return {
      entries: piles,
      tileW: spec.preferredW,
      grouped: piles.length < objects.length,
      overflow: false,
    };
  }
  const roomy = fitTiles(piles.length, width, spec);
  const pairs =
    roomy.tileW >= spec.preferredW && !roomy.overflow ? piles : groupEqual(objects, extraKey, 2);
  const entries = pairs.length < piles.length ? pairs : piles;
  const fit = entries === piles ? roomy : fitTiles(entries.length, width, spec);
  return {
    entries,
    tileW: fit.tileW,
    grouped: entries.length < objects.length,
    overflow: fit.overflow,
  };
}

/**
 * Distance between the left edges of neighbouring hand cards. Cards keep their size and overlap
 * more as the hand grows, but never closer than `minStep` so every card keeps a readable edge.
 */
export function handStep(
  count: number,
  cardW: number,
  width: number,
  gap = 6,
  minStep = 26,
): number {
  if (count <= 1) return cardW + gap;
  const room = (width - cardW) / (count - 1);
  return Math.max(minStep, Math.min(cardW + gap, Math.floor(room)));
}

/**
 * How much of the text size factor the hand cards take. A hand that would fan so tightly that the
 * middle of a card is covered by its neighbour, even when the neighbour is lifted by the pointer
 * (step under 0.65 of the card width), keeps cards smaller, down to their normal size; a short hand
 * takes the whole factor. A gain under 5 percent is not worth a different card, so it snaps to the
 * normal size. `baseW` is the normal card width, `width` the room the fan has.
 */
export function handScale(count: number, baseW: number, width: number, scale: number): number {
  if (count <= 1) return scale;
  const widest = width / (1 + 0.65 * (count - 1));
  const fit = Math.min(scale, Math.floor((widest / baseW) * 100) / 100);
  return fit < 1.05 ? 1 : fit;
}
