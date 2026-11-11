/**
 * The land row (D-215): equal lands stacked in columns of up to five, overlapped so every card
 * shows its name strip and its tapped state, similar columns side by side (`lands.ts` decides the
 * columns and the sizes). Every land is still a `Tile` of its own, so selecting, targeting,
 * hovering, dragging and tapping for mana work as they did on a flat row.
 */
import type { ObjectView } from '@commander-arena/engine';
import { type CSSProperties, useMemo, useRef } from 'react';
import { useTextScale } from '../panels/text-size';
import { HostStack } from './Attached';
import { stripReserve } from './attach';
import {
  columnHeight,
  deepest,
  groupLands,
  LAND_STACK_MAX,
  type LandColumn,
  type LandSpec,
  layoutLands,
} from './lands';
import { useMeasure } from './measure';
import { GAP, PAD_Y, type RowProps } from './row-shape';
import { Tile } from './Tile';
import { useRowScroll } from './use-row-scroll';

/** The sizes of the land row for a text size scale: square tiles, as the flat land row had. */
export function landSpec(scale: number): LandSpec {
  return {
    maxTile: Math.round(88 * scale),
    minTile: 40,
    stackTile: Math.round(48 * scale),
    minStep: Math.round(13 * scale),
    gap: GAP,
  };
}

/**
 * How much more of the field the land row asks for when its columns are deep (a stack needs height):
 * the shares of a row against the creature row's 1.6 (D-240; they were 1.35 and 1.2 against its 1.35),
 * so a stack still fits at 1366x768 when the other player's creature row grew.
 */
export function landGrow(depth: number): number {
  return depth >= 4 ? 1.6 : depth >= 2 ? 1.4 : 1;
}

function LandColumnView({
  column,
  tile,
  step,
  roles,
  attachments,
}: {
  column: LandColumn;
  tile: number;
  step: number;
} & Pick<RowProps, 'roles' | 'attachments'>) {
  const count = column.objects.length;
  // A land with an Aura is alone in its column, with the strips of the Aura under its tile.
  const only = column.objects[0];
  const under = count === 1 && only !== undefined ? attachments.get(only.id) : undefined;
  const reserve = under === undefined ? 0 : stripReserve(under.length);
  const style = {
    width: tile,
    height: columnHeight(count, tile, step) + reserve,
  } as CSSProperties;
  return (
    <span
      className="board-land-col"
      style={style}
      data-land-group={only?.name}
      data-land-count={count}
      data-land-part={column.part}
    >
      {/* The front card comes first in the document, so it is the one a click at the middle of the
          stack, a keyboard user and a test reach first; the position and the z-index put it in front. */}
      {column.objects
        .map((o, i) => (
          <span
            key={o.id}
            className="board-land-slot"
            data-front={i === count - 1 ? '' : undefined}
            style={{ top: i * step, width: tile, height: tile, zIndex: i + 1 }}
          >
            {under === undefined ? (
              <Tile object={o} w={tile} h={tile} role={roles.get(o.id)} />
            ) : (
              <HostStack host={o} attachments={under} w={tile} h={tile} role={roles.get(o.id)} />
            )}
          </span>
        ))
        .reverse()}
      {count > 1 && (
        <span className="board-land-count" aria-hidden="true">
          ×{count}
        </span>
      )}
    </span>
  );
}

export function LandRow({ objects, roles, attachments }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const scale = useTextScale();
  const reserve = Math.max(
    0,
    ...objects.map((o) => stripReserve(attachments.get(o.id)?.length ?? 0)),
  );
  const { columns, layout, nominal } = useMemo(() => {
    const alone = (o: ObjectView) => attachments.has(o.id);
    const groupsOf = (capacity: number) => groupLands(objects, capacity, alone);
    const height = (size?.height ?? 100) - 2 * PAD_Y - reserve;
    const fitted = layoutLands(
      groupsOf,
      size === null ? null : size.width,
      height,
      landSpec(scale),
    );
    return { ...fitted, nominal: deepest(groupsOf(LAND_STACK_MAX)) };
  }, [objects, attachments, size, scale, reserve]);
  const depth = deepest(columns);
  const { scroller, more, updateMore, scrollBy } = useRowScroll(
    `${columns.length}|${layout.tile}|${size?.width}`,
  );
  // The columns hang from the top of one band, centred in the row as a whole.
  const tallest = columnHeight(depth, layout.tile, layout.step) + reserve;
  const pad = Math.max(0, Math.floor(((size?.height ?? 100) - tallest) / 2));
  const style = {
    '--row-h': `${layout.tile}px`,
    '--attach-reserve': `${reserve}px`,
    '--land-grow': landGrow(nominal),
    '--land-pad': `${pad}px`,
  } as CSSProperties;

  return (
    <div
      className={`board-row board-row-land${objects.length === 0 ? ' is-empty' : ''}`}
      ref={ref}
      style={style}
      data-row="land"
    >
      <div
        className="board-row-scroll"
        ref={scroller}
        onScroll={updateMore}
        data-overflow={layout.overflow}
        data-stacked={depth > 1}
      >
        {objects.length === 0 && <span className="board-row-empty">Lands</span>}
        {columns.map((column) => (
          <LandColumnView
            key={`${column.key}#${column.part}`}
            column={column}
            tile={layout.tile}
            step={layout.step}
            roles={roles}
            attachments={attachments}
          />
        ))}
      </div>
      {more.left && (
        <button
          type="button"
          className="board-scroll board-scroll-left"
          aria-label="Scroll lands left"
          onClick={() => scrollBy(-240)}
        >
          ‹
        </button>
      )}
      {more.right && (
        <button
          type="button"
          className="board-scroll board-scroll-right"
          aria-label="Scroll lands right"
          onClick={() => scrollBy(240)}
        >
          ›
        </button>
      )}
    </div>
  );
}
