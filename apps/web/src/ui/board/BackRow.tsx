/**
 * The back line of a battlefield: the lands and, a small gap apart, every other permanent
 * (artifacts, enchantments, planeswalkers...). The creatures have the line of their own.
 */
import { useRef } from 'react';
import { useTextScale } from '../panels/text-size';
import { stripWidth } from './attach';
import { LAND_GAP, landSpec } from './LandRow';
import { clusterWidth, groupLands, layoutLands } from './lands';
import { useMeasure } from './measure';
import { BattlefieldRow, rowSpec } from './Row';
import { GAP, PAD_Y, type RowProps } from './row-shape';

type Props = Pick<RowProps, 'roles' | 'attachments'> & {
  readonly lands: RowProps['objects'];
  readonly others: RowProps['objects'];
};

/** At most this share of the line goes to the other permanents; past it they scroll. */
const OTHER_SHARE = 0.6;
/** The divider: the space before it, and the border and padding after it (board.css). */
const DIVIDER_GAP = 24;
const DIVIDER_PAD = 13;

export function BackRow({ lands, others, roles, attachments }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const scale = useTextScale();
  const height = size?.height ?? 100;
  // The other permanents take the room their tiles need; the lands (which overlap) take the rest.
  const spec = rowSpec('other', height, 0, scale);
  const extra = others.reduce((n, o) => n + stripWidth(attachments.get(o.id)?.length ?? 0), 0);
  const natural = others.length * spec.preferredW + (others.length - 1) * GAP + extra + 2 * PAD_Y;
  const width = size?.width ?? 0;
  const both = lands.length > 0 && others.length > 0;
  const otherW = Math.round(Math.min(natural, width * OTHER_SHARE || natural)) + DIVIDER_PAD;
  // The lands at the room they want (the overlap as loose as it goes), cut to what the line has left.
  const columns = groupLands(lands, (o) => attachments.has(o.id));
  const sized = layoutLands(columns, null, height - 2 * PAD_Y, landSpec(scale));
  const landNatural =
    columns.reduce((n, c) => {
      const only = c.objects[0];
      const under = c.objects.length === 1 && only ? attachments.get(only.id) : undefined;
      return (
        n +
        clusterWidth(c.objects.length, sized.width, sized.step) +
        (under === undefined ? 0 : stripWidth(under.length))
      );
    }, 0) +
    Math.max(0, columns.length - 1) * LAND_GAP +
    2 * PAD_Y;
  const room = width === 0 ? landNatural : width - 16 - (both ? otherW + DIVIDER_GAP : 0);
  const landW = Math.round(Math.max(0, Math.min(landNatural, room)));
  return (
    <div className={`board-row board-row-back${both ? ' has-both' : ''}`} data-row="back">
      {/* Measures the visible width of the field, as the other rows do. */}
      <div className="board-row-view" ref={ref} aria-hidden="true" />
      {lands.length > 0 && (
        <div className="board-back-lands" style={{ width: landW }}>
          <BattlefieldRow
            kind="land"
            inline
            objects={lands}
            roles={roles}
            attachments={attachments}
          />
        </div>
      )}
      {others.length > 0 && (
        <div className="board-back-others" style={{ width: otherW }}>
          <BattlefieldRow
            kind="other"
            inline
            objects={others}
            roles={roles}
            attachments={attachments}
          />
        </div>
      )}
    </div>
  );
}
