import type { ObjectView } from '@commander-arena/engine';
import type { CSSProperties } from 'react';
import { Art, artOf } from '../board/art';
import { CardFace } from '../board/CardFace';
import { CARD_TOP_ASPECT } from '../board/card-top';
import { useHoverProps } from './hover';

interface MiniCardProps {
  readonly card: ObjectView;
  readonly selected?: boolean;
  /** When set, the card is a toggle button. */
  readonly onClick?: (() => void) | undefined;
  readonly badge?: string | null;
  /** Card width in px, or a CSS length; the height follows the card proportions. */
  readonly width?: number | string;
  /** Show the card's picture (the complete card, as the preview panel does), not the drawn frame. */
  readonly full?: boolean;
}

/**
 * A card in a decision overlay (mulligan, discard). By default the board's own `CardFace`, so the
 * frame is drawn in one place; with `full` the complete card picture, as in the preview panel
 * (issue 48), with the card's name in its place until the picture has loaded or when it cannot.
 * Hover shows it in the preview panel.
 */
export function MiniCard({
  card,
  selected = false,
  onClick,
  badge = null,
  width = 100,
  full = false,
}: MiniCardProps) {
  // A card picture is 488:680.
  const w = typeof width === 'number' ? `${width}px` : width;
  const size = {
    '--hand-w': w,
    '--hand-h': full ? `calc(${w} * 1.3935)` : `calc(${w} / ${CARD_TOP_ASPECT.toFixed(4)})`,
  } as CSSProperties;
  const hoverProps = useHoverProps();
  const body = (
    <>
      {full ? <CardPicture card={card} /> : <CardFace object={card} variant="hand" />}
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

/** The card's picture, with its name behind it for when it is not there (offline, a token, SYNTHETIC). */
export function CardPicture({ card }: { card: ObjectView }) {
  const art = artOf(card);
  return (
    <span className="dec-card-pic">
      <span className="dec-card-name">{card.name}</span>
      <Art
        name={art.name}
        back={art.back}
        isToken={card.isToken || card.emblem === true}
        commander={card.isCommander}
        {...(card.tokenDefinition === undefined ? {} : { tokenDefinition: card.tokenDefinition })}
        version="normal"
        className="dec-card-img"
      />
    </span>
  );
}
