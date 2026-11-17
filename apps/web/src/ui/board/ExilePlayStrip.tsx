/**
 * The cards the player may cast or play from exile (impulse draw such as Stella Lee, Wild Card; an
 * Adventure; a card another player's effect lets them play), as tiles in a column at the left of their
 * battlefield, where the emblem strip is (issue 49). A tile does what a click on the card does: the
 * decision layer sends the cast with its `alternative` or `face`.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { exileBadge } from '../decisions/layouts';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { type ExilePlayable, exilePlayable } from './exile-play';
import { useHoverPreview } from './hover';

function PlayTile({ object, label }: { object: ObjectView; label: string }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  const drag = useDraggable(object.id, 'card', object.name);
  return (
    <button
      type="button"
      className={`board-exile-play${drag.dragging ? ' is-dragging' : ''}`}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      data-object-id={object.id}
      aria-label={`${label}: ${object.name}`}
      onClick={() => ix.onObject(object.id)}
      {...hover}
    >
      <span className="board-exile-play-name">{object.name}</span>
      <span className="board-exile-play-label">{label}</span>
    </button>
  );
}

/**
 * `playable` is the list the board already computed; without it the strip computes its own. The strip sits
 * in a zero-width anchor that follows the emblem strip in the row, so it starts at that strip's right edge
 * (or the field's left edge without one) and floats over the rows without moving them.
 */
export function ExilePlayStrip({ view, playable }: { view: GameView; playable?: ExilePlayable }) {
  const ix = useInteraction();
  const { cards, exile, priority, index } = playable ?? exilePlayable(view, ix.clickable);
  if (cards.length === 0) return null;
  return (
    <div className="board-exile-anchor">
      <section className="board-emblems board-exile-plays is-mine" aria-label="Cast from exile">
        <span className="board-emblems-caption">Play from exile</span>
        <ul className="board-emblems-list">
          {cards.map((o) => (
            <li key={o.id}>
              <PlayTile
                object={o}
                label={exileBadge(exile, index, o.id, priority ?? undefined) ?? 'Cast from exile'}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
