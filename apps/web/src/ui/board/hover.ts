/**
 * Hover preview wiring (A19): pointer or keyboard focus for ~150 ms shows the object in the
 * preview panel; leaving clears it; right-click pins it (Esc, handled by the decision layer,
 * unpins). Every tile, hand card, stack item and zone-viewer card in the app uses this hook.
 */
import type { ObjectId } from '@commander-arena/engine';
import { type MouseEvent, useEffect, useRef } from 'react';
import { clearStaleDrag, isDragging } from '../dnd/drag-state';
import { useActions } from '../store-context';

export const HOVER_DELAY_MS = 150;

export interface HoverHandlers {
  onMouseEnter(event?: MouseEvent): void;
  onMouseLeave(): void;
  onFocus(): void;
  onBlur(): void;
  onContextMenu(event: MouseEvent): void;
}

export function useHoverPreview(id: ObjectId): HoverHandlers {
  const { hover, pin } = useActions();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef(false);

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const enter = (event?: MouseEvent) => {
    if (event !== undefined) clearStaleDrag(event.buttons);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (isDragging()) return; // the preview stays quiet while a card is carried
      shown.current = true;
      hover(id);
    }, HOVER_DELAY_MS);
  };
  const leave = () => {
    cancel();
    shown.current = false;
    hover(null);
  };

  // A tile that disappears under the pointer never gets a mouseleave: clear what it showed.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (shown.current) hover(null);
    },
    [hover],
  );

  return {
    onMouseEnter: enter,
    onMouseLeave: leave,
    onFocus: () => enter(),
    onBlur: leave,
    onContextMenu(event) {
      event.preventDefault();
      pin(id);
    },
  };
}
