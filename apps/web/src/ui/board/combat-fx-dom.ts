/**
 * The page side of the combat animation layer (issue 9, D-228): finding the tile or the life box of
 * a recipient, measuring it, copying a tile for a sprite, and adding an element to the effects layer
 * with an animation that removes it when it ends. Nothing here touches the game or React's tree.
 */
import type { EffectTarget } from './combat-effects';

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const centreOf = (r: Rect): { readonly x: number; readonly y: number } => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
});

const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

/** The tile (or other card element) of an object on the board, if it is on screen. */
export function tileOf(id: string): HTMLElement | null {
  const el = document.querySelector(`.board [data-object-id="${cssEscape(id)}"]`);
  return el instanceof HTMLElement ? el : null;
}

/** The life box of a player. */
export function lifeBoxOf(seat: number): HTMLElement | null {
  const el = document.querySelector(`[data-seat="${seat}"]`);
  return el instanceof HTMLElement ? el : null;
}

export function elementOf(target: EffectTarget): HTMLElement | null {
  return target.kind === 'object' ? tileOf(target.id) : lifeBoxOf(target.seat);
}

function rectOfBox(el: Element): Rect | null {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0
    ? { left: box.left, top: box.top, width: box.width, height: box.height }
    : null;
}

/**
 * What a player sees of `el`: for a tapped tile the turned card (the tile's box is the upright one,
 * with room beside it), else the element's own box.
 */
export function visualRect(el: HTMLElement): Rect | null {
  const inner = el.querySelector('.board-tile-inner');
  return rectOfBox(inner ?? el);
}

/** The box of the tile itself, where a sprite copy of it must stand. */
export function boxRect(el: HTMLElement): Rect | null {
  return rectOfBox(el);
}

/**
 * Adds `el` to the layer and plays `keyframes` on it; the element is removed when the animation
 * ends or is cancelled. Returns the animation.
 */
export function addFx(
  layer: HTMLElement,
  el: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation {
  layer.appendChild(el);
  const animation = el.animate(keyframes, { fill: 'both', ...options });
  const done = () => el.remove();
  animation.onfinish = done;
  animation.oncancel = done;
  return animation;
}

/** A positioned `div` of class `className` over `rect`, grown by `grow` pixels on every side. */
export function boxAt(className: string, rect: Rect, grow = 0): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.left = `${rect.left - grow}px`;
  el.style.top = `${rect.top - grow}px`;
  el.style.width = `${rect.width + grow * 2}px`;
  el.style.height = `${rect.height + grow * 2}px`;
  return el;
}

/** A square `div` of `size` pixels centred on a point. */
export function dotAt(className: string, x: number, y: number, size: number): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.left = `${x - size / 2}px`;
  el.style.top = `${y - size / 2}px`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  return el;
}

/**
 * A copy of a tile for the layer, standing exactly where the tile stands (`box`): the sprite that
 * lunges, or the ghost that stays after the tile is gone. It takes no focus, no pointer, and carries
 * none of the tile's identity, so no script or test finds it by the object's id.
 */
export function cloneTile(tile: HTMLElement, box: Rect): HTMLElement {
  const copy = tile.cloneNode(true);
  if (!(copy instanceof HTMLElement)) throw new Error('a tile is an element');
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    for (const name of ['data-object-id', 'id', 'title', 'aria-label', 'draggable', 'data-pairs']) {
      el.removeAttribute(name);
    }
  }
  copy.setAttribute('inert', '');
  copy.tabIndex = -1;
  copy.classList.add('fx-sprite');
  copy.style.left = `${box.left}px`;
  copy.style.top = `${box.top}px`;
  copy.style.width = `${box.width}px`;
  copy.style.height = `${box.height}px`;
  copy.style.margin = '0';
  return copy;
}
