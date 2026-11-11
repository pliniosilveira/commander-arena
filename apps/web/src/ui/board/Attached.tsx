/**
 * A permanent with Auras and Equipment attached (CR 301.5, 303.4): the host's tile, and under it
 * one name strip per attachment, tucked behind the tile so the stack reads as cards laid over each
 * other. A strip is hovered, pinned and clicked like any tile (an Equipment's click opens its
 * Equip ability), and clicking the host is unchanged: it targets or selects the host.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { CSSProperties } from 'react';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { stripStep } from './attach';
import { useHoverPreview } from './hover';
import { bandBackground, type CombatRole } from './resolve';
import { Tile } from './Tile';

function AttachStrip({ object: o, host, w }: { object: ObjectView; host: ObjectView; w: number }) {
  const hover = useHoverPreview(o.id);
  const ix = useInteraction();
  // An Equipment's strip is carried like its tile: dropped on a creature it starts Equip.
  const drag = useDraggable(o.id, 'permanent', o.name);
  const clickable = ix.clickable.has(o.id);
  const selected = ix.selected.has(o.id);
  const dimmed = ix.dimOthers && !clickable && !selected;
  const badge = ix.badge(o.id);
  const classes = [
    'board-attach',
    o.subtypes.includes('Aura') ? 'board-attach-aura' : 'board-attach-gear',
    clickable ? 'is-clickable' : '',
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    drag.dragging ? 'is-dragging' : '',
    o.support === 'unsupported' ? 'is-unsupported' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      data-object-id={o.id}
      data-attached-to={host.id}
      aria-label={`${o.name}, attached to ${host.name}`}
      aria-pressed={selected}
      tabIndex={clickable ? 0 : -1}
      title={`${o.name}, attached to ${host.name}`}
      style={{ width: w }}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onClick={() => {
        if (clickable) ix.onObject(o.id);
      }}
      {...hover}
    >
      <span className="board-attach-band" style={{ background: bandBackground(o.colors) }} />
      <span className="board-attach-name">{o.name}</span>
      {badge !== null && <span className="board-attach-badge">{badge}</span>}
    </button>
  );
}

export function HostStack({
  host,
  attachments,
  w,
  h,
  role,
}: {
  host: ObjectView;
  attachments: readonly ObjectView[];
  w: number;
  h: number;
  role?: CombatRole | undefined;
}) {
  const step = stripStep(attachments.length);
  // A tapped tile is turned 90 degrees: its visible card is wider and shorter than its box.
  const turn = host.tapped ? Math.max(0, (h - w) / 2) : 0;
  const style = { '--w': `${w}px`, '--h': `${h}px` } as CSSProperties;
  return (
    <span className="board-stack" style={style} data-host-id={host.id}>
      <Tile object={host} w={w} h={h} role={role} />
      <span
        className="board-attach-list"
        style={{ top: h - turn - 3, left: 0, width: w + 2 * turn }}
      >
        {attachments.map((a, i) => (
          <span
            key={a.id}
            className="board-attach-slot"
            style={{ top: i * step, height: step + 3, zIndex: attachments.length - i }}
          >
            <AttachStrip object={a} host={host} w={w} />
          </span>
        ))}
      </span>
    </span>
  );
}
