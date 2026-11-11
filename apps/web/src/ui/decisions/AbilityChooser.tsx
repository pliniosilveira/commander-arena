import { useEffect, useRef } from 'react';
import type { MenuItem } from './abilities';
import { Popover } from './Popover';
import type { ChooserAnchor } from './ui-state';

/**
 * The popover that asks what to do with a card or permanent that has several options: cast or
 * cycle it, which of its abilities to activate, which face of a split, Adventure or modal card to
 * cast or play (with the face's cost and type line under the name). It opens with the first item focused; the arrow
 * keys move between items, Enter or Space picks the focused one, Esc closes it (keys.ts).
 */
export function AbilityChooser({
  items,
  anchor,
  pick,
  close,
}: {
  items: readonly MenuItem[];
  anchor: ChooserAnchor;
  pick: (item: MenuItem) => void;
  close: () => void;
}) {
  const box = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    // The popover is placed before this runs; the focus must not scroll anything into view.
    box.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  const move = (event: React.KeyboardEvent, step: number) => {
    const buttons = [...(box.current?.querySelectorAll('button') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(at + step + buttons.length) % buttons.length];
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  };
  return (
    <Popover
      anchor={anchor}
      className="dec-ability-chooser"
      boxRef={box}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') move(event, 1);
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') move(event, -1);
      }}
    >
      <legend className="dec-sr">Choose an ability</legend>
      <ul className="dec-ability-list">
        {items.map((item) => (
          <li key={item.key}>
            <button type="button" className="dec-chip" onClick={() => pick(item)}>
              {item.label}
              {item.detail === undefined ? null : (
                <>
                  {' '}
                  <span className="dec-chip-detail">{item.detail}</span>
                </>
              )}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="dec-chip" aria-label="Close" onClick={close}>
            ×
          </button>
        </li>
      </ul>
    </Popover>
  );
}
