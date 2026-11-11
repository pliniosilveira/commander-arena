/**
 * Drag and drop for the board: `DragProvider`, `useDraggable` and `useDropZone`.
 *
 * Choice: the native HTML5 Drag and Drop API, not pointer events. The draggable things are plain
 * buttons in a fanned hand and in scrolling rows, and `dragTo` and real mice drive native DnD
 * reliably in Chromium, with no ghost, hit testing or click suppression to maintain ourselves.
 * The cost is that touch screens and some Firefox builds do not start a native drag from a
 * `<button>`; there the click path (which every drag also has) stays the way to play. Dragging
 * is an addition, never the only way: nothing here changes what a click or a key does.
 *
 * Zones are found by event delegation on the document, from the `data-drop` attribute of the
 * element under the pointer, so a zone that React does not render here (the stack panel carries
 * only `data-drop="stack"`) works the same as the ones that use `useDropZone`.
 */
import type { ObjectId } from '@commander-arena/engine';
import {
  createContext,
  type DragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInteraction } from '../interaction';
import { useActions } from '../store-context';
import './dnd.css';
import { setDragging } from './drag-state';
import { startGhost } from './ghost';
import {
  accepts,
  type DragSource,
  type DragSpec,
  type DropTarget,
  labelFor,
  parseZoneKey,
  zoneKey,
} from './model';

/** What the decision layer offers the provider: the zones of a drag and what a drop does. */
export interface DndPlan {
  spec(id: ObjectId, source: DragSource): DragSpec | null;
  drop(id: ObjectId, source: DragSource, target: DropTarget): void;
}

export const NO_DND: DndPlan = { spec: () => null, drop: () => {} };

interface ActiveDrag {
  readonly id: ObjectId;
  readonly source: DragSource;
  readonly spec: DragSpec;
}

interface DragContextValue {
  readonly plan: DndPlan;
  readonly active: ActiveDrag | null;
  /** The key of the zone under the pointer, if it is a valid one. */
  readonly over: string | null;
  begin(drag: ActiveDrag): void;
  end(): void;
}

const DragContext = createContext<DragContextValue>({
  plan: NO_DND,
  active: null,
  over: null,
  begin: () => {},
  end: () => {},
});

/** The nearest zone element under an event target, as a drop target; null outside any zone. */
function zoneOf(target: EventTarget | null): DropTarget | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-drop]');
  if (el === null) return null;
  return parseZoneKey(el.dataset.dropKey ?? el.dataset.drop ?? '');
}

export function DragProvider({ plan, children }: { plan: DndPlan; children: ReactNode }) {
  const actions = useActions();
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The listeners below live on the document and must see the latest drag and plan.
  const live = useRef({ plan, active });
  live.current = { plan, active };

  const begin = useCallback(
    (drag: ActiveDrag) => {
      setDragging(true);
      // Re-rendering the dragged element inside its own dragstart cancels the drag in Chromium.
      setTimeout(() => {
        actions.hover(null);
        setActive(drag);
      }, 0);
    },
    [actions],
  );
  const end = useCallback(() => {
    setDragging(false);
    setActive(null);
    setOver(null);
  }, []);

  useEffect(() => {
    const valid = (e: globalThis.DragEvent) => {
      const { plan: p, active: a } = live.current;
      const target = zoneOf(e.target);
      if (a === null || target === null) return null;
      return accepts(p.spec(a.id, a.source), target) ? target : null;
    };
    const onOver = (e: globalThis.DragEvent) => {
      const target = valid(e);
      setOver((prev) => {
        const next = target === null ? null : zoneKey(target);
        return prev === next ? prev : next;
      });
      if (target !== null) {
        e.preventDefault(); // this zone takes the drop
        if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move';
      }
    };
    const onDrop = (e: globalThis.DragEvent) => {
      const { plan: p, active: a } = live.current;
      const target = valid(e);
      if (a === null || target === null) return;
      e.preventDefault();
      p.drop(a.id, a.source, target);
      // The drop can remove the dragged element (a card played from the hand), and then its
      // `dragend` never arrives: end the drag here so the preview and the zones are released.
      setDragging(false);
      setActive(null);
      setOver(null);
    };
    document.addEventListener('dragover', onOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  // Zones the provider cannot decorate through React (the stack panel) are styled from the root.
  useEffect(() => {
    const root = document.documentElement;
    const stackLabel = active === null ? null : labelFor(active.spec, { kind: 'stack' });
    if (stackLabel === null) {
      root.removeAttribute('data-dnd-stack');
      root.style.removeProperty('--dnd-stack-label');
    } else {
      root.setAttribute('data-dnd-stack', over === 'stack' ? 'over' : 'valid');
      root.style.setProperty('--dnd-stack-label', JSON.stringify(stackLabel));
    }
    return () => {
      root.removeAttribute('data-dnd-stack');
      root.style.removeProperty('--dnd-stack-label');
    };
  }, [active, over]);

  // While something is carried the zone list (a modal over the board) lets the pointer through.
  useEffect(() => {
    const root = document.documentElement;
    if (active === null) root.removeAttribute('data-dnd-active');
    else root.setAttribute('data-dnd-active', '');
    return () => root.removeAttribute('data-dnd-active');
  }, [active]);

  const value = useMemo(
    () => ({ plan, active, over, begin, end }),
    [plan, active, over, begin, end],
  );
  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}

export interface DraggableProps {
  readonly draggable: boolean;
  readonly onDragStart: (event: DragEvent) => void;
  readonly onDragEnd: () => void;
}

/**
 * Props for something the player may pick up: draggable only while the decision's `clickable` set
 * has it and the decision offers it somewhere to go. `ghost` is the text of the drag image.
 */
export function useDraggable(
  id: ObjectId,
  source: DragSource,
  ghost: string,
): DraggableProps & { readonly dragging: boolean } {
  const { plan, active, begin, end } = useContext(DragContext);
  const ix = useInteraction();
  const spec = ix.clickable.has(id) ? plan.spec(id, source) : null;
  const draggable = spec !== null;
  return {
    draggable,
    dragging: active?.id === id,
    onDragStart(event) {
      if (spec === null) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id); // Firefox starts no drag without data
      startGhost(event.dataTransfer, ghost);
      begin({ id, source, spec });
    },
    onDragEnd: end,
  };
}

export interface DropZoneProps {
  readonly 'data-drop'?: string;
  readonly 'data-drop-key'?: string;
  readonly 'data-drop-state'?: 'valid' | 'over';
  readonly 'data-drop-label'?: string;
}

/**
 * Attributes that make an element a drop zone, plus its state while something is dragged. The
 * provider (not the zone) decides what a drop means, so a zone only says what it is. Kinds that
 * can sit inside another zone (an opposing tile inside the board) are marked only while valid, so
 * a drop on your own tile still reaches your battlefield.
 */
export function useDropZone(target: DropTarget): {
  readonly props: DropZoneProps;
  readonly state: 'idle' | 'valid' | 'over';
} {
  const { plan, active, over } = useContext(DragContext);
  const key = zoneKey(target);
  const label = active === null ? null : labelFor(active.spec, target);
  const valid =
    label !== null && active !== null && accepts(plan.spec(active.id, active.source), target);
  const state = !valid ? 'idle' : over === key ? 'over' : 'valid';
  const marked = target.kind !== 'object' || valid;
  const props: DropZoneProps = marked
    ? {
        'data-drop': target.kind,
        ...(target.kind === 'seat' || target.kind === 'object' ? { 'data-drop-key': key } : {}),
        ...(state === 'idle' ? {} : { 'data-drop-state': state }),
        ...(state === 'idle' || label === null ? {} : { 'data-drop-label': label }),
      }
    : {};
  return { props, state };
}
