/**
 * The back line of a battlefield: the lands and, a small gap apart, every other permanent
 * (artifacts, enchantments, planeswalkers...). The creatures have the line of their own.
 */
import { useRef } from 'react';
import { useTextScale } from '../panels/text-size';
import { stripWidth } from './attach';
import { useMeasure } from './measure';
import { BattlefieldRow, rowSpec } from './Row';
import { GAP, PAD_Y, type RowProps } from './row-shape';

type Props = Pick<RowProps, 'roles' | 'attachments'> & {
  readonly lands: RowProps['objects'];
  readonly others: RowProps['objects'];
};

/** At most this share of the line goes to the other permanents; past it they scroll. */
const OTHER_SHARE = 0.6;

export function BackRow({ lands, others, roles, attachments }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useMeasure(ref);
  const scale = useTextScale();
  const height = size?.height ?? 100;
  // The other permanents take the room their tiles need; the lands (which overlap) take the rest.
  const spec = rowSpec('other', height, 0, scale);
  const extra = others.reduce((n, o) => n + stripWidth(attachments.get(o.id)?.length ?? 0), 0);
  const natural = others.length * spec.preferredW + (others.length - 1) * GAP + extra + 2 * PAD_Y;
  const otherW = Math.round(Math.min(natural, (size?.width ?? 0) * OTHER_SHARE || natural));
  const both = lands.length > 0 && others.length > 0;
  return (
    <div className={`board-row board-row-back${both ? ' has-both' : ''}`} data-row="back" ref={ref}>
      {lands.length > 0 && (
        <BattlefieldRow
          kind="land"
          inline
          objects={lands}
          roles={roles}
          attachments={attachments}
        />
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
