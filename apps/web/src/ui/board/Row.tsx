/**
 * One battlefield row (A19): tiles at a preferred size, shrunk as the row fills, identical tokens
 * grouped below the minimum width, horizontal scrolling with arrows when it still overflows.
 */
import type { ObjectView } from '@commander-arena/engine';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteraction } from '../interaction';
import { useTextScale } from '../panels/text-size';
import { HostStack } from './Attached';
import { stripReserve } from './attach';
import { LandRow } from './LandRow';
import { layoutRow, type RowSpec } from './layout';
import { useMeasure } from './measure';
import { type CombatRole, type RowKind, roleKey } from './resolve';
import { GAP, PAD_Y, type RowProps } from './row-shape';
import { Tile } from './Tile';
import { useRowScroll } from './use-row-scroll';

const ROW_LABEL: Readonly<Record<RowKind, string>> = {
  creature: 'Creatures',
  land: 'Lands',
  other: 'Other permanents',
};

/** Tile proportions per row: how tall at most, how wide relative to height, the legible minimum. */
const ROW_SHAPE: Readonly<Record<RowKind, { maxH: number; aspect: number; minW: number }>> = {
  // D-240 (issue 137): the largest tiles are a quarter bigger than they were (108, 84 and 70 before).
  creature: { maxH: 136, aspect: 0.74, minW: 56 },
  other: { maxH: 105, aspect: 0.9, minW: 54 },
  // Square, so a tapped land (turned 90 degrees) takes no more room than an untapped one.
  land: { maxH: 88, aspect: 1, minW: 56 },
};

/**
 * `reserve` is the room the row keeps under its tiles for attachment strips (`stripReserve` of the
 * busiest host); the tiles shrink to leave it.
 */
export function rowSpec(kind: RowKind, availableH: number, reserve = 0, scale = 1): RowSpec {
  const shape = ROW_SHAPE[kind];
  // The text size setting grows the tiles where the row has room for it (never past what is free).
  const tileH = Math.max(
    40,
    Math.min(Math.round(shape.maxH * scale), availableH - 2 * PAD_Y - reserve),
  );
  const preferredW = Math.round(tileH * shape.aspect);
  return {
    tileH,
    preferredW,
    minW: Math.min(Math.round(shape.minW * scale), preferredW),
    gap: GAP,
  };
}

function GroupTile({
  objects,
  w,
  h,
  roles,
}: {
  objects: readonly ObjectView[];
  w: number;
  h: number;
  roles: ReadonlyMap<string, CombatRole>;
}) {
  const scale = useTextScale();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const open = hovered || pinned;
  const first = objects[0];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || el === null) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 392));
    setPos(
      rect.top > window.innerHeight / 2
        ? { left, bottom: window.innerHeight - rect.top - 4 }
        : { left, top: rect.bottom - 4 },
    );
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setPinned(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);

  if (first === undefined) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only widens what the button shows
    <span
      ref={ref}
      className="board-group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Tile
        object={first}
        w={w}
        h={h}
        count={objects.length}
        role={roles.get(first.id)}
        onActivate={() => setPinned((p) => !p)}
      />
      {open && (
        <fieldset className="board-group-pop" style={pos} aria-label={`${first.name} tokens`}>
          {objects.map((o) => (
            <Tile
              key={o.id}
              object={o}
              w={Math.round(64 * scale)}
              h={Math.round(88 * scale)}
              role={roles.get(o.id)}
            />
          ))}
        </fieldset>
      )}
    </span>
  );
}

function PlainRow({ kind, objects, roles, attachments }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const ix = useInteraction();
  const reserve = Math.max(
    0,
    ...objects.map((o) => stripReserve(attachments.get(o.id)?.length ?? 0)),
  );
  const scale = useTextScale();
  const spec = rowSpec(kind, size?.height ?? 100, reserve, scale);
  // Tokens that differ in what the player acts on must not hide inside one group.
  const extraKey = useCallback(
    (o: ObjectView) =>
      `${ix.clickable.has(o.id)}|${ix.selected.has(o.id)}|${ix.badge(o.id) ?? ''}|${roleKey(
        roles.get(o.id),
      )}`,
    [ix, roles],
  );
  const layout = layoutRow(objects, size === null ? null : size.width, spec, extraKey);
  const { scroller, more, updateMore, scrollBy } = useRowScroll(
    `${layout.entries.length}|${layout.tileW}|${size?.width}`,
  );
  const style = {
    '--row-h': `${spec.tileH}px`,
    '--attach-reserve': `${reserve}px`,
  } as CSSProperties;

  return (
    <div
      className={`board-row board-row-${kind}${objects.length === 0 ? ' is-empty' : ''}`}
      ref={ref}
      style={style}
      data-row={kind}
    >
      <div
        className="board-row-scroll"
        ref={scroller}
        onScroll={updateMore}
        data-overflow={layout.overflow}
        data-grouped={layout.grouped}
      >
        {objects.length === 0 && <span className="board-row-empty">{ROW_LABEL[kind]}</span>}
        {layout.entries.map((e) => {
          if (e.kind === 'group') {
            return (
              <GroupTile
                key={e.key}
                objects={e.objects}
                w={layout.tileW}
                h={spec.tileH}
                roles={roles}
              />
            );
          }
          const under = attachments.get(e.object.id);
          return under === undefined ? (
            <Tile
              key={e.object.id}
              object={e.object}
              w={layout.tileW}
              h={spec.tileH}
              role={roles.get(e.object.id)}
            />
          ) : (
            <HostStack
              key={e.object.id}
              host={e.object}
              attachments={under}
              w={layout.tileW}
              h={spec.tileH}
              role={roles.get(e.object.id)}
            />
          );
        })}
      </div>
      {more.left && (
        <button
          type="button"
          className="board-scroll board-scroll-left"
          aria-label={`Scroll ${ROW_LABEL[kind].toLowerCase()} left`}
          onClick={() => scrollBy(-240)}
        >
          ‹
        </button>
      )}
      {more.right && (
        <button
          type="button"
          className="board-scroll board-scroll-right"
          aria-label={`Scroll ${ROW_LABEL[kind].toLowerCase()} right`}
          onClick={() => scrollBy(240)}
        >
          ›
        </button>
      )}
    </div>
  );
}

/** One battlefield row: the land row stacks equal lands in columns (`LandRow.tsx`), the others lay tiles in a line. */
export function BattlefieldRow(props: RowProps) {
  return props.kind === 'land' ? <LandRow {...props} /> : <PlainRow {...props} />;
}
