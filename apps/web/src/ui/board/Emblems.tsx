/**
 * The emblem strip of a battlefield (issue 84, D-243): the monarch, the Ring and the emblems of one
 * player as small cards in a column of their own at the left of the player's battlefield, apart from
 * the permanents: no row, no drag, nothing to target. A card is hovered or focused to show it whole
 * in the preview panel, like every other card. A player with none of them has no strip.
 */
import type { GameView, SeatId } from '@commander-arena/engine';
import { Art } from './art';
import {
  type EmblemCard,
  emblemCaption,
  emblemCardLabel,
  emblemCards,
  emblemStripLabel,
} from './emblems';
import { useHoverPreview } from './hover';

function EmblemTile({ view, card }: { view: GameView; card: EmblemCard }) {
  const hover = useHoverPreview(card.object.id);
  const mine = card.seat === view.viewer;
  const text = card.object.oracleText;
  return (
    <button
      type="button"
      className={`board-emblem board-emblem-${card.kind} ${mine ? 'is-mine' : 'is-theirs'}`}
      data-object-id={card.object.id}
      data-emblem-kind={card.kind}
      data-emblem-owner={card.seat}
      aria-label={emblemCardLabel(view, card)}
      title={`${card.object.name}${mine ? '' : " (opponent's)"}\n${text}`}
      {...hover}
    >
      {card.kind === 'monarch' && (
        // The art of the monarch card, when Scryfall has it; a failed load leaves the drawn card (art.tsx).
        <Art
          name={card.object.name}
          isToken={false}
          version="art_crop"
          className="board-emblem-art"
        />
      )}
      <span className="board-emblem-name">{card.object.name}</span>
      <span className="board-emblem-text">{text}</span>
    </button>
  );
}

export function EmblemStrip({ view, seat }: { view: GameView; seat: SeatId }) {
  const cards = emblemCards(view, seat);
  if (cards.length === 0) return null;
  return (
    <section
      className={`board-emblems ${seat === view.viewer ? 'is-mine' : 'is-theirs'}`}
      data-emblems-seat={seat}
      aria-label={emblemStripLabel(view, seat)}
    >
      <span className="board-emblems-caption">{emblemCaption(view, seat)}</span>
      <ul className="board-emblems-list">
        {cards.map((card) => (
          <li key={card.object.id}>
            <EmblemTile view={view} card={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}
