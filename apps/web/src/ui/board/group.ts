/**
 * Dense-board grouping (A19): permanents that are equal, state included, collapse into one tile
 * with a count. Pure, so it is unit tested without a DOM.
 */
import type { ObjectView } from '@commander-arena/engine';

export type TileEntry =
  | { readonly kind: 'single'; readonly object: ObjectView }
  | { readonly kind: 'group'; readonly key: string; readonly objects: readonly ObjectView[] };

const byName = ([a]: [string, unknown], [b]: [string, unknown]) => (a < b ? -1 : a > b ? 1 : 0);
const baseKeys = new WeakMap<ObjectView, string>();

/**
 * Everything the view says about a permanent except which object it is, so two permanents share a
 * key only when nothing the player could read or act on tells them apart: a field added to the view
 * later separates them without a change here. Attachments are part of it: a permanent with an Aura
 * or Equipment on it never matches another, because the attachment ids differ, so it keeps its own
 * tile and its strips (`attach.ts`); the same holds for a paired creature (D-286, CR 702.95b).
 */
function baseKey(o: ObjectView): string {
  const known = baseKeys.get(o);
  if (known !== undefined) return known;
  const { id: _id, counters, keywords, ...rest } = o;
  const key = JSON.stringify([
    Object.entries(counters).sort(byName),
    [...keywords].sort(),
    Object.entries(rest).sort(byName),
  ]);
  baseKeys.set(o, key);
  return key;
}

/** The key two permanents share when one tile can stand for both. */
export function permanentKey(o: ObjectView, extra = ''): string {
  return `${baseKey(o)}|${extra}`;
}

/** A commander is one card the player follows all game: it never hides in a group. */
const groups = (o: ObjectView): boolean => !o.isCommander;

/**
 * Collapses equal permanents into groups of at least `minSize`, keeping the position of the first
 * member. `extraKey` lets the caller keep permanents apart that differ in something the view does
 * not carry (attacking, selected, clickable), so grouping never hides a state the player acts on.
 */
export function groupEqual(
  objects: readonly ObjectView[],
  extraKey?: (o: ObjectView) => string,
  minSize = 2,
): TileEntry[] {
  const keys = new Map<ObjectView, string>();
  const buckets = new Map<string, ObjectView[]>();
  for (const o of objects) {
    if (!groups(o)) continue;
    const key = permanentKey(o, extraKey?.(o));
    keys.set(o, key);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [o]);
    else bucket.push(o);
  }
  const entries: TileEntry[] = [];
  const emitted = new Set<string>();
  for (const o of objects) {
    const key = keys.get(o);
    const bucket = key === undefined ? undefined : buckets.get(key);
    if (key === undefined || bucket === undefined || bucket.length < Math.max(2, minSize)) {
      entries.push({ kind: 'single', object: o });
    } else if (!emitted.has(key)) {
      emitted.add(key);
      entries.push({ kind: 'group', key, objects: bucket });
    }
  }
  return entries;
}
