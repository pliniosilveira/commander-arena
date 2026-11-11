/**
 * Row and hand sizing (A19). The CSS draws what these numbers say; they are pure so the
 * shrink / group / scroll decision is unit tested.
 */
import type { ObjectView } from '@commander-arena/engine';
import { groupTokens, type TileEntry } from './group';

export interface RowSpec {
  /** Tile height in pixels (fixed by the row's available height). */
  readonly tileH: number;
  /** Width at which a tile is drawn while the row has room. */
  readonly preferredW: number;
  /** Narrowest tile whose name and power/toughness frame stay legible. */
  readonly minW: number;
  readonly gap: number;
}

export interface RowLayout {
  readonly entries: readonly TileEntry[];
  readonly tileW: number;
  /** Identical tokens were collapsed because the row did not fit at the minimum width. */
  readonly grouped: boolean;
  /** Still wider than the row after grouping: the row scrolls horizontally. */
  readonly overflow: boolean;
}

/** A tapped tile is turned 90 degrees, so it takes its height as horizontal room. */
export function slotWidth(tapped: boolean, tileW: number, tileH: number): number {
  return tapped ? Math.max(tileW, tileH) : tileW;
}

function totalWidth(tapped: readonly boolean[], tileW: number, spec: RowSpec): number {
  let sum = 0;
  for (const t of tapped) sum += slotWidth(t, tileW, spec.tileH);
  return sum + Math.max(0, tapped.length - 1) * spec.gap;
}

/** The widest tile width in [minW, preferredW] that fits, and whether even that overflows. */
export function fitTiles(
  tapped: readonly boolean[],
  width: number,
  spec: RowSpec,
): { tileW: number; overflow: boolean } {
  const n = tapped.length;
  if (n === 0) return { tileW: spec.preferredW, overflow: false };
  const tappedCount = tapped.filter(Boolean).length;
  const upright = n - tappedCount;
  const free = width - (n - 1) * spec.gap - tappedCount * Math.max(spec.tileH, 0);
  const ideal = upright > 0 ? Math.floor(free / upright) : spec.preferredW;
  const tileW = Math.max(spec.minW, Math.min(spec.preferredW, ideal));
  return { tileW, overflow: totalWidth(tapped, tileW, spec) > width + 0.5 };
}

/**
 * Decides one row: prefer full size, shrink to the minimum, then group identical tokens, then
 * scroll. `width` null means "not measured yet" (server render): draw at preferred size.
 */
export function layoutRow(
  objects: readonly ObjectView[],
  width: number | null,
  spec: RowSpec,
  extraKey?: (o: ObjectView) => string,
): RowLayout {
  const single: TileEntry[] = objects.map((object) => ({ kind: 'single', object }));
  if (width === null) {
    return { entries: single, tileW: spec.preferredW, grouped: false, overflow: false };
  }
  const tappedOf = (e: TileEntry) => (e.kind === 'single' ? e.object.tapped : e.objects[0]?.tapped);
  const plain = fitTiles(
    single.map((e) => tappedOf(e) === true),
    width,
    spec,
  );
  if (!plain.overflow)
    return { entries: single, tileW: plain.tileW, grouped: false, overflow: false };
  const entries = groupTokens(objects, extraKey);
  const grouped = entries.length < single.length;
  const fit = fitTiles(
    entries.map((e) => tappedOf(e) === true),
    width,
    spec,
  );
  return { entries, tileW: fit.tileW, grouped, overflow: fit.overflow };
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
