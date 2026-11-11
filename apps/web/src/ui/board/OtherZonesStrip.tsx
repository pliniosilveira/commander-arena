/**
 * The cards the player can cast right now from another zone, as rows of chips above the hand:
 * the graveyard cards with flashback (CR 702.34a, "Name Flashback {2}{B}"), escape (CR 702.138a,
 * "Name Escape {G}{G}, exile 5 other cards") or unearth (CR 702.84a, "Name Unearth {R}") and the cards in exile
 * that resolved as an Adventure (CR 715.3d, "Name Cast from exile"), the cards an effect lets the player play from exile ("You may play that card this
 * turn", D-151: "Name Cast from exile", a land "Name Play from exile") and the top card of the library under a permission to cast it from there
 * ("Name Cast from the top of your library"). A graveyard and the shared
 * exile are otherwise only a count that opens a list, and a castable card in one would be easy to
 * miss. A chip does what a click on the card does (the decision layer sends the cast with its
 * `alternative` or `face`).
 */
import type { GameView, ObjectId, ObjectView } from '@commander-arena/engine';
import { exileMarks, FACE_DOWN_NAME, isHiddenFaceDown } from '../../game/later-text';
import { graveyardLabels, graveyardPlayObjects } from '../decisions/flashback';
import { exileBadge, exileCastObjects, libraryBadge } from '../decisions/layouts';
import { objectIndex } from '../decisions/lookup';
import { playableObjects } from '../decisions/priority';
import { useDraggable } from '../dnd/DragProvider';
import { useInteraction } from '../interaction';
import { useHoverPreview } from './hover';
import './later.css';

function Chip({ object, label }: { object: ObjectView; label: string }) {
  const hover = useHoverPreview(object.id);
  const ix = useInteraction();
  const drag = useDraggable(object.id, 'card', object.name);
  return (
    <button
      type="button"
      className={`board-flashback-chip${drag.dragging ? ' is-dragging' : ''}`}
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      data-object-id={object.id}
      aria-label={`${label}: ${object.name}`}
      onClick={() => ix.onObject(object.id)}
      {...hover}
    >
      <b>{object.name}</b> <span>{label}</span>
    </button>
  );
}

/**
 * A card in exile that is not castable now but has something to show (D-128): a suspended card with its
 * time counters (either player's, CR 702.62b), the viewer's own foretold card, the other player's face-down
 * card ("Face-down card (face down)", and nothing else: the view has no more to give).
 */
function StatusChip({ object, mine }: { object: ObjectView; mine: boolean }) {
  const hover = useHoverPreview(object.id);
  const hidden = isHiddenFaceDown(object);
  const name = hidden ? FACE_DOWN_NAME : object.name;
  const marks = exileMarks(object);
  // The placeholder is the mark itself: "Face-down card (face down)", whatever put it there (foretell, Hideaway).
  const label = hidden ? '(face down)' : marks.join(', ');
  return (
    <li
      className={`board-exile-chip${mine ? '' : ' is-opponent'}`}
      data-object-id={object.id}
      data-exile-owner={object.owner}
      aria-label={`${name} ${label}${mine ? '' : ", opponent's"}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusing a chip previews the card for keyboard users
      tabIndex={0}
      {...hover}
    >
      <b>{name}</b> <span>{label}</span>
      {mine ? null : <span> {"(opponent's)"}</span>}
    </li>
  );
}

export function OtherZonesStrip({ view }: { view: GameView }) {
  const ix = useInteraction();
  const pending = view.pending;
  const priority = pending?.kind === 'priority' ? pending : null;
  const index = objectIndex(view);
  const graveyard = view.seats[view.viewer]?.graveyard ?? [];
  const usable =
    priority === null ? new Set<ObjectId>() : graveyardPlayObjects(priority, graveyard);
  const fromGraveyard = graveyard.filter((o) => usable.has(o.id) && ix.clickable.has(o.id));
  // Exile is shared; the cards the viewer may cast or play from there are those the engine lists, which include a card of another player that an
  // effect let the viewer play (D-187, CR 406.3: "You may look at and play those cards").
  const exile = priority === null ? new Set<ObjectId>() : exileCastObjects(priority, index);
  const fromExile = view.exile.filter((o) => exile.has(o.id) && ix.clickable.has(o.id));
  // D-151 (CR 601.3): the top card of the viewer's own library, when a permanent lets them cast it from there.
  const top = view.seats[view.viewer]?.libraryTop;
  const playable = priority === null ? new Set<ObjectId>() : playableObjects(priority);
  const fromLibrary =
    top !== undefined && ix.clickable.has(top.id) && libraryBadge(playable, index, top.id) !== null
      ? [top]
      : [];
  const shownCast = new Set(fromExile.map((o) => o.id));
  const status = view.exile.filter((o) => !shownCast.has(o.id) && exileMarks(o).length > 0);
  return (
    <>
      {fromGraveyard.length > 0 && priority !== null && (
        <section className="board-flashback" aria-label="Cast from your graveyard">
          {fromGraveyard.map((o) => (
            <Chip key={o.id} object={o} label={graveyardLabels(priority, o).join(' / ')} />
          ))}
        </section>
      )}
      {fromLibrary.length > 0 && (
        <section className="board-flashback" aria-label="Cast from the top of your library">
          {fromLibrary.map((o) => (
            <Chip
              key={o.id}
              object={o}
              label={libraryBadge(playable, index, o.id) ?? 'Cast from the top of your library'}
            />
          ))}
        </section>
      )}
      {fromExile.length > 0 && (
        <section className="board-flashback" aria-label="Cast from exile">
          {fromExile.map((o) => (
            <Chip
              key={o.id}
              object={o}
              label={exileBadge(exile, index, o.id, priority ?? undefined) ?? 'Cast from exile'}
            />
          ))}
        </section>
      )}
      {status.length > 0 && (
        <ul className="board-exile-strip" aria-label="Suspended and foretold cards in exile">
          {status.map((o) => (
            <StatusChip key={o.id} object={o} mine={o.owner === view.viewer} />
          ))}
        </ul>
      )}
    </>
  );
}
