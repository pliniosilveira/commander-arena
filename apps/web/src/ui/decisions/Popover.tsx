import { type KeyboardEventHandler, type ReactNode, type RefObject, useRef } from 'react';
import type { ChooserAnchor } from './ui-state';
import { usePopoverPlace } from './use-popover-place';

/**
 * The frame of the small choice popovers of the decision layer (ability menu, mana colour): a
 * fieldset that opens next to the card it points at and is always fully inside the layer (issue
 * 85). Before it is measured it sits under the card, as it always did.
 */
export function Popover({
  anchor,
  className = '',
  boxRef,
  onKeyDown,
  children,
}: {
  anchor: ChooserAnchor;
  className?: string;
  /** For the caller that needs the element (to move the focus into it). */
  boxRef?: RefObject<HTMLFieldSetElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLFieldSetElement>;
  children: ReactNode;
}) {
  const own = useRef<HTMLFieldSetElement>(null);
  const ref = boxRef ?? own;
  const bottom = anchor.bottom ?? anchor.top;
  usePopoverPlace(ref, { left: anchor.left, top: anchor.top, bottom }, anchor.object);
  return (
    <fieldset
      ref={ref}
      className={`dec-popover dec-panel${className === '' ? '' : ` ${className}`}`}
      style={{ left: anchor.left, top: bottom + 4 }}
      onKeyDown={onKeyDown}
    >
      {children}
    </fieldset>
  );
}
