/**
 * One battlefield row (A19): tiles at a preferred size, equal permanents grouped, the tiles shrunk
 * as the row fills, horizontal scrolling with arrows when it still overflows.
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
import { stripWidth } from './attach';
import { CARD_TOP_ASPECT, cardTopHeight } from './card-top';
import { LandRow } from './LandRow';
import { layoutRow, type RowSpec } from './layout';
import { useMeasure } from './measure';
import { type CombatRole, type RowKind, roleKey } from './resolve';
import { GAP, PAD_Y, type RowProps } from './row-shape';
import { Tile } from './Tile';

/**
 * Tile proportions per row: how tall at most and how wide relative to height. Every tile has the
 * shape of the top of a card cut under its type line (`card-top.ts`), wider than tall.
 */
const ROW_SHAPE: Readonly<Record<RowKind, { maxH: number; aspect: number }>> = {
  // D-240 (issue 137): the largest tiles are a quarter bigger than they were (108, 84 and 70 before).
  creature: { maxH: 136, aspect: CARD_TOP_ASPECT },
  other: { maxH: 88, aspect: CARD_TOP_ASPECT },
  land: { maxH: 88, aspect: CARD_TOP_ASPECT },
};

/**
 * `extraW` is the width the row spends on attachment strips beside its tiles (`stripWidth` of each
 * host); a row that cannot hold them scrolls.
 */
export function rowSpec(kind: RowKind, availableH: number, extraW = 0, scale = 1): RowSpec {
  const shape = ROW_SHAPE[kind];
  // The text size setting grows the tiles where the row has room for it (never past what is free).
  const tileH = Math.max(40, Math.min(Math.round(shape.maxH * scale), availableH - 2 * PAD_Y));
  const preferredW = Math.round(tileH * shape.aspect);
  return {
    tileH,
    preferredW,
    // A card never shrinks to fit: a full row scrolls sideways (the three rows together).
    minW: preferredW,
    gap: GAP,
    extraW,
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
  const ix = useInteraction();
  // While the game asks for some of them, a click on the pile answers with one member: it then
  // differs from the rest (selected), leaves the pile, and the next click takes the next one.
  const pick = first !== undefined && ix.clickable.has(first.id) ? first.id : null;
  const popW = Math.round(96 * scale);

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
        onActivate={() => (pick === null ? setPinned((p) => !p) : ix.onObject(pick))}
      />
      {open && (
        <fieldset
          className="board-group-pop"
          style={pos}
          aria-label={first.isToken ? `${first.name} tokens` : `Every ${first.name}`}
        >
          {objects.map((o) => (
            <Tile key={o.id} object={o} w={popW} h={cardTopHeight(popW)} role={roles.get(o.id)} />
          ))}
        </fieldset>
      )}
    </span>
  );
}

function PlainRow({ kind, objects, roles, attachments, inline }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const ix = useInteraction();
  const extraW = objects.reduce((n, o) => n + stripWidth(attachments.get(o.id)?.length ?? 0), 0);
  const scale = useTextScale();
  const spec = rowSpec(kind, size?.height ?? 100, extraW, scale);
  // Permanents that differ in what the player acts on must not hide inside one group.
  const extraKey = useCallback(
    (o: ObjectView) =>
      `${ix.clickable.has(o.id)}|${ix.selected.has(o.id)}|${ix.badge(o.id) ?? ''}|${roleKey(
        roles.get(o.id),
      )}`,
    [ix, roles],
  );
  const layout = layoutRow(objects, size === null ? null : size.width, spec, extraKey);
  // A tile narrower than the preferred width keeps its shape, so the card's top is cut at the same line.
  const tileH = Math.min(spec.tileH, cardTopHeight(layout.tileW));
  const style = { '--row-h': `${spec.tileH}px` } as CSSProperties;

  return (
    <div
      className={`board-row board-row-${kind}${objects.length === 0 ? ' is-empty' : ''}${inline ? ' board-row-inline' : ''}`}
      ref={ref}
      style={style}
      data-row={kind}
    >
      {/* Measures the visible width of the field (not the wide row): the layout fits the cards to it. */}
      <div className="board-row-view" ref={ref} aria-hidden="true" />
      <div
        className="board-row-scroll"
        data-overflow={layout.overflow}
        data-grouped={layout.grouped}
      >
        {layout.entries.map((e) => {
          if (e.kind === 'group') {
            return (
              <GroupTile key={e.key} objects={e.objects} w={layout.tileW} h={tileH} roles={roles} />
            );
          }
          const under = attachments.get(e.object.id);
          return under === undefined ? (
            <Tile
              key={e.object.id}
              object={e.object}
              w={layout.tileW}
              h={tileH}
              role={roles.get(e.object.id)}
            />
          ) : (
            <HostStack
              key={e.object.id}
              host={e.object}
              attachments={under}
              w={layout.tileW}
              h={tileH}
              role={roles.get(e.object.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** One battlefield row: the land row stacks equal lands in columns (`LandRow.tsx`), the others lay tiles in a line. */
export function BattlefieldRow(props: RowProps) {
  return props.kind === 'land' ? <LandRow {...props} /> : <PlainRow {...props} />;
}
