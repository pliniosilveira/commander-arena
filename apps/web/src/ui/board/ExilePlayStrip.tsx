/**
 * The cards the player may cast or play from another zone: exile (impulse draw such as Stella Lee, Wild Card; an
 * Adventure; a card another player's effect lets them play), as tiles in a column at the left of their
 * battlefield, where the emblem strip is (issue 49). A tile does what a click on the card does: the
 * decision layer sends the cast with its `alternative` or `face`.
 */
import type { GameView, ObjectId, ObjectView } from '@commander-arena/engine';
import { GRAVEYARD_CAST, graveyardLabels } from '../decisions/flashback';
import { CAST_FROM_LIBRARY, exileBadge, libraryBadge } from '../decisions/layouts';
import { playableObjects } from '../decisions/priority';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { type ExilePlayable, exilePlayable } from './exile-play';
import { useHoverPreview } from './hover';

function PlayTile({
  object,
  label,
  via,
}: {
  object: ObjectView;
  label: string;
  via?: ObjectId | undefined;
}) {
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
      // A Hideaway card is played by the ability of the permanent that exiled it: the click goes there.
      onClick={() => ix.onObject(via ?? object.id)}
      {...hover}
    >
      <span className="board-exile-play-name">{object.name}</span>
      <span className="board-exile-play-label">{label}</span>
    </button>
  );
}

/** The graveyard label, with the zone first unless the label already names it ("Cast from graveyard"). */
const graveyardTileLabel = (labels: string): string =>
  labels.startsWith(GRAVEYARD_CAST) ? labels : `Graveyard: ${labels}`;

/**
 * `playable` is the list the board already computed; without it the strip computes its own. The strip sits
 * in a zero-width anchor at the right end of the field row and floats over the right side of the rows, so
 * it never meets the emblem strip at the left and the permanents stay centred. Every tile names its zone in
 * its label, because the cards come from three places: exile, the graveyard and the top of the library.
 * Cards that are only a status (suspended, foretold, face down) are not listed here: they are not playable now.
 */
export function ExilePlayStrip({ view, playable }: { view: GameView; playable?: ExilePlayable }) {
  const ix = useInteraction();
  const { cards, graveyard, library, exile, via, priority, index } =
    playable ?? exilePlayable(view, ix.clickable);
  if (cards.length + graveyard.length + library.length === 0) return null;
  const playableIds = priority === null ? new Set<ObjectId>() : playableObjects(priority);
  return (
    <div className="board-exile-anchor">
      <section
        className="board-emblems board-exile-plays is-mine"
        aria-label="Playable from other zones"
      >
        <span className="board-emblems-caption">Playable from other zones</span>
        <ul className="board-emblems-list">
          {graveyard.map((o) => (
            <li key={o.id}>
              <PlayTile
                object={o}
                label={graveyardTileLabel(
                  priority === null ? '' : graveyardLabels(priority, o).join(' / '),
                )}
              />
            </li>
          ))}
          {library.map((o) => (
            <li key={o.id}>
              <PlayTile
                object={o}
                label={libraryBadge(playableIds, index, o.id) ?? CAST_FROM_LIBRARY}
              />
            </li>
          ))}
          {cards.map((o) => (
            <li key={o.id}>
              <PlayTile
                object={o}
                via={via.get(o.id)}
                label={
                  via.has(o.id)
                    ? 'Play from exile (Hideaway)'
                    : (exileBadge(exile, index, o.id, priority ?? undefined) ?? 'Cast from exile')
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
