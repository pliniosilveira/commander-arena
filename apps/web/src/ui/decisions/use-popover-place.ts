import { type RefObject, useLayoutEffect } from 'react';
import { type PopoverRect, placePopover } from './popover-place';

/**
 * Moves a popover (an absolutely positioned element of the decision layer) so that it is fully
 * inside the layer: under what it points at, or above it when under does not fit (issue 85). It
 * runs before the browser paints, so the popover is never seen in its first place; it measures
 * the element itself, so the size does not have to be known. `anchor` is where the card was when
 * the popover was asked for, in the layer's coordinates (the layer is the element's offset
 * parent). A hand card is lifted by the pointer over it, with a transition, so it is read again
 * where it ends up (`objectId`: the element that carries `data-object-id`), and when the window
 * changes size.
 */
export function usePopoverPlace(
  ref: RefObject<HTMLElement | null>,
  anchor: PopoverRect,
  objectId?: string,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent;
    if (el === null || el === undefined || !(box instanceof HTMLElement)) return;
    const target =
      objectId === undefined ? null : document.querySelector(`[data-object-id="${objectId}"]`);
    const place = (from: PopoverRect) => {
      const spot = placePopover(
        from,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: box.clientWidth, height: box.clientHeight },
      );
      el.style.left = `${spot.left}px`;
      el.style.top = `${spot.top}px`;
      el.dataset.side = spot.side;
    };
    const live = () => {
      if (target === null) return place(anchor);
      const at = target.getBoundingClientRect();
      const room = box.getBoundingClientRect();
      place({ left: at.left - room.left, top: at.top - room.top, bottom: at.bottom - room.top });
    };
    place(anchor);
    target?.addEventListener('transitionend', live);
    window.addEventListener('resize', live);
    return () => {
      target?.removeEventListener('transitionend', live);
      window.removeEventListener('resize', live);
    };
  });
}
