import { type RefObject, useCallback, useLayoutEffect, useState } from 'react';
import { type HiddenCards, hiddenCards, NONE_HIDDEN } from './hidden-cards';

/**
 * How many cards a sideways scroller hides at each side (hidden-cards.ts), kept current on scroll,
 * on a resize and when cards arrive or leave. `refresh` re-reads at once, for a scroll the caller
 * makes itself (re-centring).
 */
export function useHiddenCards(
  scroller: RefObject<HTMLElement | null>,
  /** Selects the cards inside the scroller. */
  selector: string,
): { readonly hidden: HiddenCards; readonly refresh: () => void } {
  const [hidden, setHidden] = useState<HiddenCards>(NONE_HIDDEN);
  const refresh = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    const view = el.getBoundingClientRect();
    const cards = Array.from(el.querySelectorAll(selector), (c) => c.getBoundingClientRect());
    const next = hiddenCards(view, cards);
    setHidden((h) => (h.left === next.left && h.right === next.right ? h : next));
  }, [scroller, selector]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    refresh();
    el.addEventListener('scroll', refresh, { passive: true });
    const resize = new ResizeObserver(refresh);
    resize.observe(el);
    const mutation = new MutationObserver(refresh);
    mutation.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', refresh);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [scroller, refresh]);
  return { hidden, refresh };
}
