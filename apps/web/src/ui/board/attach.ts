/**
 * Auras and Equipment on the board (CR 301.5, 303.4): an attachment is drawn with the permanent it
 * is attached to, as name strips under that permanent's tile, not as a tile of its own. The view
 * says who is attached to whom (`ObjectView.attachedTo`, `ObjectView.attachments`); this file only
 * turns that into "which tiles stand alone" and "which strips hang under which tile". Pure, so the
 * grouping is unit tested without a DOM.
 */
import type { ObjectId, ObjectView } from '@commander-arena/engine';

export interface Attachments {
  /** Host id to its attachments, oldest first. An attachment of an attachment is flattened under the root host. */
  readonly byHost: ReadonlyMap<ObjectId, readonly ObjectView[]>;
  /** Every object that is drawn as a strip, so the rows leave it out. */
  readonly attached: ReadonlySet<ObjectId>;
}

/**
 * Width of one strip. The strips lie behind the host's tile and show a vertical sliver of their
 * right side, the way equal basic lands overlap in the land row (`lands.ts`). Every strip keeps
 * this width however many there are: the row makes room for them.
 */
export const STRIP_W = 30;

/** Room a tile needs beside it for `count` strips, in pixels. */
export function stripWidth(count: number): number {
  return count <= 0 ? 0 : count * STRIP_W;
}

/**
 * Splits the battlefield into the objects that get a tile and the attachments hanging under them.
 * An attachment whose host is not on the battlefield (the view never lists one, but be safe) or
 * that sits in a cycle keeps its own tile, so nothing ever disappears from the board.
 */
export function splitAttachments(battlefield: readonly ObjectView[]): Attachments {
  const byId = new Map<ObjectId, ObjectView>();
  for (const o of battlefield) byId.set(o.id, o);
  const children = new Map<ObjectId, ObjectView[]>();
  for (const o of battlefield) {
    if (o.attachedTo === undefined || !byId.has(o.attachedTo)) continue;
    const list = children.get(o.attachedTo) ?? [];
    list.push(o);
    children.set(o.attachedTo, list);
  }
  // The host lists its attachments oldest first (it is the order of the timestamps).
  for (const [hostId, list] of children) {
    const order = byId.get(hostId)?.attachments ?? [];
    const rank = (o: ObjectView) => {
      const i = order.indexOf(o.id);
      return i < 0 ? order.length : i;
    };
    list.sort((a, b) => rank(a) - rank(b));
  }
  const byHost = new Map<ObjectId, ObjectView[]>();
  const attached = new Set<ObjectId>();
  const collect = (id: ObjectId, into: ObjectView[]): void => {
    for (const child of children.get(id) ?? []) {
      if (attached.has(child.id)) continue; // a cycle: stop here
      attached.add(child.id);
      into.push(child);
      collect(child.id, into);
    }
  };
  for (const o of battlefield) {
    if (o.attachedTo !== undefined && byId.has(o.attachedTo)) continue; // not a root
    const into: ObjectView[] = [];
    collect(o.id, into);
    if (into.length > 0) byHost.set(o.id, into);
  }
  return { byHost, attached };
}
