/**
 * Arrow geometry for the stack panel (SPEC 10 "Stack panel"): a pure function of two boxes, so it
 * is tested without a DOM. The stack panel measures the DOM and feeds boxes in; nothing here reads
 * the page.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The part of a DOMRect the math needs. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Arrow {
  readonly from: Point;
  readonly to: Point;
  /** Control point of the quadratic curve from `from` to `to`. */
  readonly control: Point;
  /** The arrowhead triangle; its first point is the tip (equal to `to`). */
  readonly head: readonly [Point, Point, Point];
  /** SVG path data for the shaft. */
  readonly path: string;
  /** SVG points data for the head. */
  readonly headPoints: string;
}

export interface ArrowOptions {
  /** Gap between the arrow tip and the target's edge, in px. */
  readonly gap?: number;
  /** Arrowhead length in px. */
  readonly headSize?: number;
  /** How far the curve bows out, as a fraction of the distance (sign picks the side). */
  readonly bend?: number;
  /** Arrows shorter than this are not drawn. */
  readonly minLength?: number;
}

export const center = (b: Box): Point => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

export function contains(b: Box, p: Point): boolean {
  return p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
}

/**
 * The part of `box` that shows inside `clip` (the box of a scrolling list). A box scrolled out of
 * sight is pulled to the nearest edge of the clip and kept 2px thick, so an arrow still starts at
 * the list instead of far off screen, at the position the item would have if the list did not scroll.
 */
export function clipBox(box: Box, clip: Box): Box {
  const edge = (v: number) => Math.min(Math.max(v, clip.top), clip.bottom);
  let top = edge(box.top);
  let bottom = edge(box.bottom);
  if (bottom - top < 2) {
    if (top <= clip.top) bottom = Math.min(top + 2, clip.bottom);
    else top = Math.max(bottom - 2, clip.top);
  }
  return { left: box.left, right: box.right, top, bottom };
}

/**
 * `from` reduced to the edge that faces `to`, when `to` lies wholly to one side of it. A stack item
 * is a wide, short box: an arrow that leaves it from the middle of the facing edge does not cross
 * the items above and below it on its way to a target on the other side of the board.
 */
export function facingEdge(from: Box, to: Box): Box {
  if (to.right <= from.left) return { ...from, right: from.left };
  if (to.left >= from.right) return { ...from, left: from.right };
  return from;
}

/** Where the ray from the box's center toward `toward` leaves the box, grown by `pad`. */
export function edgePoint(b: Box, toward: Point, pad = 0): Point {
  const c = center(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const halfW = (b.right - b.left) / 2 + pad;
  const halfH = (b.bottom - b.top) / 2 + pad;
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy);
  const scale = Math.min(sx, sy);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * An arrow from the edge of `from` to the edge of `to`, or null when there is nothing sensible to
 * draw (a box inside the other, or the two touching).
 */
export function arrowBetween(from: Box, to: Box, options: ArrowOptions = {}): Arrow | null {
  const gap = options.gap ?? 3;
  const headSize = options.headSize ?? 10;
  const bend = options.bend ?? 0.15;
  const minLength = options.minLength ?? 12;

  const fromCenter = center(from);
  const toCenter = center(to);
  if (contains(from, toCenter) || contains(to, fromCenter)) return null;

  const start = edgePoint(from, toCenter);
  const tip = edgePoint(to, fromCenter, gap);
  const dx = tip.x - start.x;
  const dy = tip.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < minLength) return null;

  // Bow the shaft sideways a little so arrows from one item to several targets stay apart.
  const offset = Math.max(-60, Math.min(60, length * bend));
  const control: Point = {
    x: (start.x + tip.x) / 2 + (-dy / length) * offset,
    y: (start.y + tip.y) / 2 + (dx / length) * offset,
  };

  // The head points along the curve's tangent at the tip.
  const tx = tip.x - control.x;
  const ty = tip.y - control.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const base: Point = { x: tip.x - ux * headSize, y: tip.y - uy * headSize };
  const wing = headSize * 0.5;
  const head: readonly [Point, Point, Point] = [
    tip,
    { x: base.x - uy * wing, y: base.y + ux * wing },
    { x: base.x + uy * wing, y: base.y - ux * wing },
  ];
  return {
    from: start,
    to: tip,
    control,
    head,
    path: `M${fmt(start.x)} ${fmt(start.y)} Q${fmt(control.x)} ${fmt(control.y)} ${fmt(base.x)} ${fmt(base.y)}`,
    headPoints: head.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' '),
  };
}

/**
 * For two boxes too close for a straight arrow (a spell targeting the stack item right below it):
 * a loop that leaves the left edge of `from`, bows out to the left and comes back to the left edge
 * of `to`. Null when one box contains the other or they are the same box.
 */
export function loopArrow(from: Box, to: Box, options: ArrowOptions = {}): Arrow | null {
  const gap = options.gap ?? 3;
  const headSize = options.headSize ?? 10;
  if (contains(from, center(to)) || contains(to, center(from))) return null;
  const start: Point = { x: from.left, y: (from.top + from.bottom) / 2 };
  const tip: Point = { x: to.left - gap, y: (to.top + to.bottom) / 2 };
  if (Math.hypot(tip.x - start.x, tip.y - start.y) < 1) return null;
  const reach = Math.max(28, Math.abs(tip.y - start.y) / 2 + 12);
  const control: Point = {
    x: Math.min(start.x, tip.x) - reach,
    y: (start.y + tip.y) / 2,
  };
  const base: Point = { x: tip.x - headSize, y: tip.y };
  const wing = headSize * 0.5;
  const head: readonly [Point, Point, Point] = [
    tip,
    { x: base.x, y: base.y + wing },
    { x: base.x, y: base.y - wing },
  ];
  return {
    from: start,
    to: tip,
    control,
    head,
    path: `M${fmt(start.x)} ${fmt(start.y)} Q${fmt(control.x)} ${fmt(control.y)} ${fmt(base.x)} ${fmt(base.y)}`,
    headPoints: head.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' '),
  };
}
