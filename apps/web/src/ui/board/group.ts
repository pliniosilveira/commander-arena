/**
 * Dense-board grouping (A19): identical tokens collapse into one tile with a count. Nontoken
 * permanents never group. Pure, so it is unit tested without a DOM.
 */
import type { ObjectView } from '@commander-arena/engine';

export type TileEntry =
  | { readonly kind: 'single'; readonly object: ObjectView }
  | { readonly kind: 'group'; readonly key: string; readonly objects: readonly ObjectView[] };

/**
 * Everything that makes two tokens look and behave the same. Attachments are part of it (A19
 * groups only tokens with the same attachments): a token with an Aura or Equipment on it never
 * matches another token, because the attachment ids differ, so it keeps its own tile and its
 * strips (`attach.ts`).
 */
export function tokenKey(o: ObjectView, extra = ''): string {
  return JSON.stringify([
    o.name,
    o.controller,
    o.supertypes,
    o.types,
    o.subtypes,
    o.colors,
    o.power,
    o.toughness,
    o.oracleText,
    o.tapped,
    o.damage,
    Object.entries(o.counters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    [...o.keywords].sort(),
    o.summoningSick,
    o.support,
    o.attachments ?? [],
    // D-286 (CR 702.95b): a paired token is the partner of one creature in particular, so it never groups (the ids differ); the Ring-bearer is one token of its player.
    o.pairedWith ?? null,
    o.pairedPhasedOut ?? null,
    o.ringBearer ?? null,
    extra,
  ]);
}

/**
 * Collapses runs of identical tokens into groups, keeping the position of the first member.
 * `extraKey` lets the caller keep tokens apart that differ in something the view does not carry
 * (attacking, selected, clickable), so grouping never hides a state the player acts on.
 */
export function groupTokens(
  objects: readonly ObjectView[],
  extraKey?: (o: ObjectView) => string,
): TileEntry[] {
  const buckets = new Map<string, ObjectView[]>();
  for (const o of objects) {
    if (!o.isToken) continue;
    const key = tokenKey(o, extraKey?.(o));
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [o]);
    else bucket.push(o);
  }
  const entries: TileEntry[] = [];
  const emitted = new Set<string>();
  for (const o of objects) {
    if (!o.isToken) {
      entries.push({ kind: 'single', object: o });
      continue;
    }
    const key = tokenKey(o, extraKey?.(o));
    const bucket = buckets.get(key);
    if (bucket === undefined || bucket.length < 2) {
      entries.push({ kind: 'single', object: o });
    } else if (!emitted.has(key)) {
      emitted.add(key);
      entries.push({ kind: 'group', key, objects: bucket });
    }
  }
  return entries;
}
