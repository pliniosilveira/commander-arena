import type { ObjectId } from '@commander-arena/engine';
import { useCallback, useEffect, useRef } from 'react';
import { useActionsIfPresent } from '../store-context';

const noHover = (_id: ObjectId | null): void => {};
const noPin = (_id: ObjectId | null): void => {};

/** The delay before a hover reaches the preview panel (brief: about 150 ms). */
const HOVER_DELAY_MS = 150;

/**
 * Hover, focus and right-click handlers for cards drawn by the decision layer. After 150 ms the
 * object goes to the preview panel (`hover(id)`), leaving clears it, right-click pins it.
 */
export function useHoverProps(): (id: ObjectId) => {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onContextMenu: (event: { preventDefault: () => void }) => void;
} {
  // Outside a StoreProvider (a panel drawn on its own) there is no preview to drive: hovering does nothing.
  const actions = useActionsIfPresent();
  const hover = actions?.hover ?? noHover;
  const pin = actions?.pin ?? noPin;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const leave = useCallback(() => {
    cancel();
    if (shown.current) {
      shown.current = false;
      hover(null);
    }
  }, [cancel, hover]);

  useEffect(() => leave, [leave]);

  return useCallback(
    (id: ObjectId) => {
      const enter = () => {
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          shown.current = true;
          hover(id);
        }, HOVER_DELAY_MS);
      };
      return {
        onPointerEnter: enter,
        onPointerLeave: leave,
        onFocus: enter,
        onBlur: leave,
        onContextMenu: (event) => {
          event.preventDefault();
          pin(id);
        },
      };
    },
    [cancel, leave, hover, pin],
  );
}
