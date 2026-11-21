/**
 * The land row: one line, every land side by side, and equal basic lands overlapped horizontally
 * like cards on a table (the first in front, each next one behind it showing a strip of its right
 * side). Pure, so the order, the clusters and the sizes are unit tested without a DOM.
 *
 * - A group is the lands that look alike: the same card name (a basic land by its name, a nonbasic
 *   land by its card name, so two Command Towers stack), the same state the player reads on the
 *   tile (counters, a chosen color or type, a control effect), token or card. A land with an Aura
 *   on it stands alone: its strips hang under its own tile.
 * - Only basic lands overlap: a cluster is every card of one basic group. A nonbasic land is a tile
 *   of its own, so two Command Towers stand side by side.
 * - Groups are ordered the way a player sorts: basic lands first in the order of the colors (Plains,
 *   Island, Swamp, Mountain, Forest, then Wastes), the snow-covered ones after the plain ones, then
 *   the nonbasic lands by name.
 * - Inside a cluster the cards are in the order they entered (the object id), the first in front.
 *   Tapping a land never moves it: a click on a card taps it and a second click untaps it, as on a
 *   flat row, and the tilt and a mark in its corner show which cards are tapped.
 */
import type { ObjectId, ObjectView } from '@commander-arena/engine';
import { chosenLabel } from '../../game/chosen';

/** Order of the basic land names: the colors in the order of the color wheel (W, U, B, R, G), then Wastes. */
const BASIC_ORDER: readonly string[] = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
];
const NONBASIC_RANK = 10;

/** The name a basic land is sorted under: "Snow-Covered Forest" sorts with "Forest". */
function basicName(o: ObjectView): string {
  return o.name.replace(/^Snow-Covered /, '');
}

/** Where the group of a land sorts among the groups: the basic lands by color, then the rest. */
export function landRank(o: ObjectView): number {
  if (!o.supertypes.includes('basic')) return NONBASIC_RANK;
  const at = BASIC_ORDER.indexOf(basicName(o));
  return at === -1 ? BASIC_ORDER.length : at;
}

/**
 * Everything that makes two lands one group. The name is the main part; the rest keeps lands apart
 * when the tile of the one under another would hide something the player acts on or reads: counters,
 * a choice made as it entered, a control effect, a token (a token copy of a Forest is not a Forest
 * card), and an attached Aura (`alone`).
 */
export function landKey(o: ObjectView, alone = false): string {
  return JSON.stringify([
    o.name,
    o.isToken,
    o.controller,
    Object.entries(o.counters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    chosenLabel(o)?.title ?? '',
    o.controlEnds ?? null,
    o.support,
    alone ? o.id : '',
  ]);
}

/** One cluster of the land row: the overlapped cards of a basic group, or one nonbasic land. */
export interface LandColumn {
  /** The group's key, shared by its clusters. */
  readonly key: string;
  /** Its cards from the front to the back, in the order they entered; the first is drawn in front. */
  readonly objects: readonly ObjectView[];
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const numberOf = (id: ObjectId): number => Number(id.slice(1));

interface Group {
  readonly key: string;
  readonly objects: ObjectView[];
}

/** The clusters of a land row. `alone` names the lands that must not overlap (an Aura hangs under them). */
export function groupLands(
  lands: readonly ObjectView[],
  alone: (o: ObjectView) => boolean = () => false,
): LandColumn[] {
  const groups = new Map<string, Group>();
  for (const o of lands) {
    const key = landKey(o, alone(o));
    const known = groups.get(key);
    if (known === undefined) groups.set(key, { key, objects: [o] });
    else known.objects.push(o);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const x = a.objects[0];
    const y = b.objects[0];
    if (x === undefined || y === undefined) return 0;
    return (
      landRank(x) - landRank(y) ||
      Number(x.supertypes.includes('snow')) - Number(y.supertypes.includes('snow')) ||
      compareText(x.name, y.name) ||
      Number(x.isToken) - Number(y.isToken) ||
      compareText(a.key, b.key)
    );
  });
  const columns: LandColumn[] = [];
  for (const group of ordered) {
    const cards = [...group.objects].sort((a, b) => numberOf(a.id) - numberOf(b.id));
    const first = cards[0];
    if (first !== undefined && first.supertypes.includes('basic') && !first.isToken) {
      columns.push({ key: group.key, objects: cards });
    } else {
      for (const card of cards) columns.push({ key: group.key, objects: [card] });
    }
  }
  return columns;
}

// ------------------------------------------------------------------------------------- sizes

export interface LandSpec {
  /** Tile height when the row has all the room it wants. */
  readonly maxTile: number;
  /** Width of a tile over its height (1, a square, when left out). */
  readonly aspect?: number;
  /** The smallest tile whose name stays legible. */
  readonly minTile: number;
  /** The least of a card that shows when another lies over it, in pixels. */
  readonly minStep: number;
  readonly gap: number;
  /** Width the row spends on attachment strips beside its lands, whatever the tile size. */
  readonly extraW?: number;
}

export interface LandLayout {
  /** The height of a tile. */
  readonly tile: number;
  /** The width of a tile. */
  readonly width: number;
  /** Distance between the left edges of neighbouring cards of a cluster. */
  readonly step: number;
  /** Still wider than the row at the smallest tile: the row scrolls sideways. */
  readonly overflow: boolean;
}

/** The most of a card that shows when the row has room: a third of its width. */
const roomyStepOf = (width: number): number => Math.round(width * 0.34);

/** The width a cluster of `count` cards takes. */
export const clusterWidth = (count: number, width: number, step: number): number =>
  width + Math.max(0, count - 1) * step;

/**
 * The size of the clusters of a one-line land row: the tile is as tall as the row allows (at most
 * `maxTile`), then the overlap tightens down to `minStep`, and past that the row scrolls; the tile
 * keeps its size. `width` null means not measured yet: no limit.
 */
export function layoutLands(
  columns: readonly LandColumn[],
  width: number | null,
  height: number,
  spec: LandSpec,
): LandLayout {
  const widthOf = (t: number) => Math.round(t * (spec.aspect ?? 1));
  let tile = Math.max(spec.minTile, Math.min(spec.maxTile, Math.floor(height)));
  // The tile never shrinks to fit: past the tightest overlap the row scrolls.
  const floor = tile;
  const overlaps = columns.reduce((n, c) => n + Math.max(0, c.objects.length - 1), 0);
  if (width === null || columns.length === 0) {
    return { tile, width: widthOf(tile), step: roomyStepOf(widthOf(tile)), overflow: false };
  }
  for (;;) {
    const w = widthOf(tile);
    const base = columns.length * w + (columns.length - 1) * spec.gap + (spec.extraW ?? 0);
    const room = overlaps === 0 ? Infinity : Math.floor((width + 0.5 - base) / overlaps);
    const step = Math.min(roomyStepOf(w), room);
    if (base <= width + 0.5 && (overlaps === 0 || step >= spec.minStep)) {
      return { tile, width: w, step: Math.max(step, spec.minStep), overflow: false };
    }
    if (tile <= floor) {
      return { tile, width: w, step: spec.minStep, overflow: true };
    }
    tile -= 1;
  }
}
