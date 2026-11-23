/**
 * The land row: one line of lands side by side. Equal basic lands overlap horizontally, the first in
 * front and each next one behind it showing a strip (`lands.ts` decides the clusters and the sizes). Every land is still a `Tile` of its own, so selecting, targeting,
 * hovering, dragging and tapping for mana work as they did on a flat row.
 */
import type { ObjectView } from '@commander-arena/engine';
import { type CSSProperties, useMemo, useRef } from 'react';
import { useTextScale } from '../panels/text-size';
import { HostStack } from './Attached';
import { stripWidth } from './attach';
import { CARD_TOP_ASPECT } from './card-top';
import { clusterWidth, groupLands, type LandColumn, type LandSpec, layoutLands } from './lands';
import { useMeasure } from './measure';
import { GAP, PAD_Y, type RowProps } from './row-shape';
import { Tile } from './Tile';

/** The space between neighbouring clusters of the land row, a little wider than a plain row's. */
export const LAND_GAP = GAP + 6;

/** The sizes of the land row for a text size scale: tiles in the shape of a card's top (`card-top.ts`). */
export function landSpec(scale: number, extraW = 0): LandSpec {
  return {
    maxTile: Math.round(88 * scale),
    aspect: CARD_TOP_ASPECT,
    minTile: 40,
    minStep: Math.round(14 * scale),
    gap: LAND_GAP,
    extraW,
  };
}

function LandColumnView({
  column,
  tile,
  width,
  step,
  roles,
  attachments,
}: {
  column: LandColumn;
  tile: number;
  width: number;
  step: number;
} & Pick<RowProps, 'roles' | 'attachments'>) {
  const count = column.objects.length;
  // A land with an Aura is alone in its column, with the strips of the Aura under its tile.
  const only = column.objects[0];
  const under = count === 1 && only !== undefined ? attachments.get(only.id) : undefined;
  const style = {
    width: clusterWidth(count, width, step) + (under === undefined ? 0 : stripWidth(under.length)),
    height: tile,
  } as CSSProperties;
  return (
    <span
      className="board-land-col"
      style={style}
      data-land-group={only?.name}
      data-land-count={count}
    >
      {/* The front card comes first in the document, so it is the one a keyboard user and a test
          reach first; the z-index puts each card over the ones after it. */}
      {column.objects.map((o, i) => (
        <span
          key={o.id}
          className="board-land-slot"
          data-front={i === 0 ? '' : undefined}
          style={{ left: i * step, width, height: tile, zIndex: count - i }}
        >
          {under === undefined ? (
            <Tile object={o} w={width} h={tile} role={roles.get(o.id)} />
          ) : (
            <HostStack host={o} attachments={under} w={width} h={tile} role={roles.get(o.id)} />
          )}
        </span>
      ))}
      {count > 1 && (
        <span className="board-land-count" aria-hidden="true">
          ×{count}
        </span>
      )}
    </span>
  );
}

export function LandRow({ objects, roles, attachments, inline }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const scale = useTextScale();
  const extraW = objects.reduce((n, o) => n + stripWidth(attachments.get(o.id)?.length ?? 0), 0);
  const { columns, layout } = useMemo(() => {
    const alone = (o: ObjectView) => attachments.has(o.id);
    const columns = groupLands(objects, alone);
    const height = (size?.height ?? 100) - 2 * PAD_Y;
    const spec = landSpec(scale, extraW);
    const layout = layoutLands(columns, size === null ? null : size.width, height, spec);
    return { columns, layout };
  }, [objects, attachments, size, scale, extraW]);
  // The clusters hang from the top of one band, centred in the row as a whole.
  const pad = Math.max(0, Math.floor(((size?.height ?? 100) - layout.tile) / 2));
  const style = {
    '--row-h': `${layout.tile}px`,
    '--land-pad': `${pad}px`,
  } as CSSProperties;

  return (
    <div
      className={`board-row board-row-land${objects.length === 0 ? ' is-empty' : ''}${inline ? ' board-row-inline' : ''}`}
      style={style}
      data-row="land"
    >
      {/* Measures the visible width of the field (not the wide row): the layout fits the cards to it. */}
      <div className="board-row-view" ref={ref} aria-hidden="true" />
      <div
        className="board-row-scroll"
        data-overflow={layout.overflow}
        data-stacked={columns.some((c) => c.objects.length > 1)}
      >
        {columns.map((column) => (
          <LandColumnView
            key={column.objects[0]?.id ?? column.key}
            column={column}
            tile={layout.tile}
            width={layout.width}
            step={layout.step}
            roles={roles}
            attachments={attachments}
          />
        ))}
      </div>
    </div>
  );
}
