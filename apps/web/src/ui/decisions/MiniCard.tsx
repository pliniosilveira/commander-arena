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
  /** Draw the whole card (picture and rules text), as the preview panel does, not the small frame. */
  readonly full?: boolean;
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
  full = false,
}: MiniCardProps) {
  // The full face sizes itself from --preview-card-w and is as tall as a card is (488:680).
  const size = {
    '--hand-w': `${width}px`,
    '--hand-h': `${Math.round(width * (full ? 1.3935 : 1.4))}px`,
    ...(full ? { '--preview-card-w': `${width}px` } : {}),
  } as CSSProperties;
  const hoverProps = useHoverProps();
  const body = (
    <>
      <CardFace object={card} variant={full ? 'full' : 'hand'} />
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
