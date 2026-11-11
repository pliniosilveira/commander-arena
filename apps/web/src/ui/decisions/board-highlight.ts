/**
 * Lighting a creature on the board from outside it (issue 92): the damage panel's rows point at
 * the permanents they are about. The board's tiles carry `data-object-id`; the row sets
 * `data-assign-hot` on the tile while the pointer or the keyboard focus is on the row, and
 * `decisions.css` draws it. The preview panel is fed by the same hover as the tiles' (`useHoverProps`).
 */
import type { ObjectId } from '@commander-arena/engine';
import { useCallback, useEffect, useRef } from 'react';
import { useHoverProps } from './hover';

const ATTRIBUTE = 'data-assign-hot';

function tilesOf(id: ObjectId): Element[] {
  return [...document.querySelectorAll(`[data-object-id="${id}"]`)];
}

export interface RowFocusProps {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onContextMenu: (event: { preventDefault: () => void }) => void;
}

/** Handlers for a row about one object: preview it and light its tile, until the pointer leaves. */
export function useRowFocus(): (id: ObjectId) => RowFocusProps {
  const hoverProps = useHoverProps();
  const lit = useRef<ObjectId | null>(null);

  const unlight = useCallback(() => {
    if (lit.current === null) return;
    for (const tile of tilesOf(lit.current)) tile.removeAttribute(ATTRIBUTE);
    lit.current = null;
  }, []);
  const light = useCallback(
    (id: ObjectId) => {
      unlight();
      lit.current = id;
      for (const tile of tilesOf(id)) tile.setAttribute(ATTRIBUTE, 'true');
    },
    [unlight],
  );
  // A row that goes away under the pointer must not leave a tile lit.
  useEffect(() => unlight, [unlight]);

  return useCallback(
    (id) => {
      const base = hoverProps(id);
      return {
        ...base,
        onPointerEnter: () => {
          base.onPointerEnter();
          light(id);
        },
        onPointerLeave: () => {
          base.onPointerLeave();
          unlight();
        },
        onFocus: () => {
          base.onFocus();
          light(id);
        },
        onBlur: () => {
          base.onBlur();
          unlight();
        },
      };
    },
    [hoverProps, light, unlight],
  );
}
