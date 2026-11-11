import type { ObjectId, ObjectView } from '@commander-arena/engine';

/** An object index (id to view) over a list of views, as `objectIndex` builds from a game view. */
export function lookupIndexFor(objects: readonly ObjectView[]): ReadonlyMap<ObjectId, ObjectView> {
  return new Map(objects.map((o) => [o.id, o]));
}
