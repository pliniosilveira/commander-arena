import type { ObjectView } from '@commander-arena/engine';
import type { CSSProperties } from 'react';
import { CardFace } from '../board/CardFace';
import { useHoverProps } from './hover';

interface MiniCardProps {
  readonly card: ObjectView;
  readonly selected?: boolean;
  /** When set, the card is a toggle button. */
  readonly onClick?: (() => void) | undefined;
  readonly badge?: string | null;
  /** Card width in px; the height follows the card proportions. */
  readonly width?: number;
}

/**
 * A card in a decision overlay (mulligan, discard): the board's own `CardFace`, so the frame is
 * drawn in one place and an image can replace it later. Hover shows it in the preview panel.
 */
export function MiniCard({
  card,
  selected = false,
  onClick,
  badge = null,
  width = 100,
}: MiniCardProps) {
  const size = {
    '--hand-w': `${width}px`,
    '--hand-h': `${Math.round(width * 1.4)}px`,
  } as CSSProperties;
  const hoverProps = useHoverProps();
  const body = (
    <>
      <CardFace object={card} variant="hand" />
      {badge === null ? null : <span className="dec-card-badge">{badge}</span>}
    </>
  );
  const className = `dec-card${selected ? ' dec-card-selected' : ''}`;
  return onClick === undefined ? (
    <div className={className} style={size} {...hoverProps(card.id)}>
      {body}
    </div>
  ) : (
    <button
      type="button"
      className={`${className} dec-card-button`}
      style={size}
      aria-pressed={selected}
      onClick={onClick}
      {...hoverProps(card.id)}
    >
      {body}
    </button>
  );
}
