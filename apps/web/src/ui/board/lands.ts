/**
 * The land row as players lay lands out at a table (D-215): equal lands stacked in small columns,
 * similar columns side by side. Pure, so the order, the columns and the sizes are unit tested
 * without a DOM.
 *
 * - A group is the lands that look alike: the same card name (a basic land by its name, a nonbasic
 *   land by its card name, so two Command Towers stack), the same state the player reads on the
 *   tile (counters, a chosen color or type, a control effect), token or card. A land with an Aura
 *   on it stands alone: its strips hang under its own tile.
 * - A column holds at most five cards of one group; the sixth starts a new column. The columns are
 *   filled in that order, so a land that arrives never moves the cards already laid out.
 * - Groups are ordered the way a player sorts: basic lands first in the order of the colors (Plains,
 *   Island, Swamp, Mountain, Forest, then Wastes), the snow-covered ones after the plain ones, then
 *   the nonbasic lands by name.
 * - Inside a column the cards are in the order they entered (the object id), the last one in front.
 *   Tapping a land never moves it: a click on a card taps it and a second click untaps it, as on a
 *   flat row, and the rotation (and a mark on its strip) shows which cards are tapped.
 */
import type { ObjectId, ObjectView } from '@commander-arena/engine';
import { chosenLabel } from '../../game/chosen';

/** The most cards one column holds. */
export const LAND_STACK_MAX = 5;

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

/** One column of the land row. */
export interface LandColumn {
  /** The group's key, shared by its columns. */
  readonly key: string;
  /** Its cards from the back to the front, in the order they entered; the last is drawn in front. */
  readonly objects: readonly ObjectView[];
  /** This column's place among the columns of its group (0 first) and how many the group has. */
  readonly part: number;
  readonly parts: number;
  /** Every card of the group, over all its columns. */
  readonly groupSize: number;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const numberOf = (id: ObjectId): number => Number(id.slice(1));

interface Group {
  readonly key: string;
  readonly objects: ObjectView[];
}

/**
 * The columns of a land row. `capacity` is how many cards a column holds (at most
 * `LAND_STACK_MAX`; a short row passes less). `alone` names the lands that must not stack.
 */
export function groupLands(
  lands: readonly ObjectView[],
  capacity: number = LAND_STACK_MAX,
  alone: (o: ObjectView) => boolean = () => false,
): LandColumn[] {
  const size = Math.max(1, Math.min(LAND_STACK_MAX, Math.floor(capacity)));
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
    const parts = Math.ceil(cards.length / size);
    for (let part = 0; part < parts; part += 1) {
      columns.push({
        key: group.key,
        objects: cards.slice(part * size, (part + 1) * size),
        part,
        parts,
        groupSize: cards.length,
      });
    }
  }
  return columns;
}

/** The number of cards in the deepest column of a row laid out with `capacity` per column. */
export function deepest(columns: readonly LandColumn[]): number {
  return columns.reduce((most, column) => Math.max(most, column.objects.length), 1);
}

// ------------------------------------------------------------------------------------- sizes

export interface LandSpec {
  /** Tile height and width (lands are square) when the row has all the room it wants. */
  readonly maxTile: number;
  /** The smallest tile whose name stays legible. */
  readonly minTile: number;
  /**
   * The smallest tile worth overlapping cards for: below it a row makes its columns shallower and
   * uses its width instead, which is cheap, rather than draw small tiles.
   */
  readonly stackTile: number;
  /** The least of a card that shows when another lies over it (its name strip). */
  readonly minStep: number;
  readonly gap: number;
}

export interface LandLayout {
  /** Cards a column holds in this row. */
  readonly capacity: number;
  /** The side of a (square) tile. */
  readonly tile: number;
  /** Distance between the top edges of neighbouring cards of a column. */
  readonly step: number;
  /** Still wider than the row at the smallest tile: the row scrolls sideways. */
  readonly overflow: boolean;
}

/** How much of a card shows when another lies over it, for a tile of this size, at the least. */
const stripOf = (tile: number, spec: LandSpec): number =>
  Math.max(spec.minStep, Math.round(tile * 0.22));
/** And the most it shows when the row has room: a third of the card. */
const roomyStripOf = (tile: number): number => Math.round(tile * 0.34);

/**
 * The biggest tile at most `spec.maxTile` for a column of `depth` cards in `height`; null when the
 * smallest worthwhile tile (`stackTile` for a stack, `minTile` for a single card) does not fit.
 */
function tileForDepth(depth: number, height: number, spec: LandSpec): number | null {
  const smallest = depth > 1 ? Math.min(spec.stackTile, spec.maxTile) : spec.minTile;
  for (let tile = spec.maxTile; tile >= smallest; tile -= 1) {
    if (tile + (depth - 1) * stripOf(tile, spec) <= height) return tile;
  }
  return null;
}

/**
 * The size of the columns of a land row. `groupsOf(capacity)` returns the columns of the row for a
 * capacity (`groupLands` over the row's lands). The capacity is the deepest column the height
 * allows at a worthwhile tile (at most five); then the tile shrinks until the columns fit the width,
 * down to `minTile`, and past that the row scrolls. `width` null means not measured yet: no limit.
 */
export function layoutLands(
  groupsOf: (capacity: number) => readonly LandColumn[],
  width: number | null,
  height: number,
  spec: LandSpec,
): { readonly layout: LandLayout; readonly columns: readonly LandColumn[] } {
  const wanted = deepest(groupsOf(LAND_STACK_MAX));
  let capacity = wanted;
  let tile = tileForDepth(capacity, height, spec);
  while (tile === null && capacity > 1) {
    capacity -= 1;
    tile = tileForDepth(capacity, height, spec);
  }
  // One card deep always fits: the row is short, so the tile is as tall as the row allows.
  let side = tile ?? Math.max(spec.minTile, Math.min(spec.maxTile, height));
  const columns = groupsOf(capacity);
  const depth = deepest(columns);
  let overflow = false;
  if (width !== null && columns.length > 0) {
    const fits = (t: number) => columns.length * t + (columns.length - 1) * spec.gap <= width + 0.5;
    while (side > spec.minTile && !fits(side)) side -= 1;
    overflow = !fits(side);
  }
  const room = depth > 1 ? Math.floor((height - side) / (depth - 1)) : 0;
  const step = depth > 1 ? Math.max(1, Math.min(roomyStripOf(side), room)) : 0;
  return { layout: { capacity, tile: side, step, overflow }, columns };
}

/** The height a column of `depth` cards takes. */
export const columnHeight = (depth: number, tile: number, step: number): number =>
  tile + Math.max(0, depth - 1) * step;
