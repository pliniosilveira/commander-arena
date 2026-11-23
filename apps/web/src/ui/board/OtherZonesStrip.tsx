/**
 * The cards in exile that are not playable now but have something to show, as a row of chips above the hand: a suspended card, the
 * viewer's own foretold or Hideaway card, a card face down. The cards the viewer may cast or play from another zone (exile, graveyard,
 * top of the library) are tiles at the right of the battlefield instead (`ExilePlayStrip`, issue 49).
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { exileMarks, FACE_DOWN_NAME, isHiddenFaceDown } from '../../game/later-text';
import { bareMidPossessiveOf } from '../../game/seat-name';
import { useInteraction } from '../interaction';
import { type ExilePlayable, exilePlayable } from './exile-play';
import { useHoverPreview } from './hover';
import './later.css';

/**
 * A card in exile that is not castable now but has something to show (D-128): a suspended card with its
 * time counters (either player's, CR 702.62b), the viewer's own foretold card, the other player's face-down
 * card ("Face-down card (face down)", and nothing else: the view has no more to give).
 */
function StatusChip({
  object,
  mine,
  owner,
}: {
  object: ObjectView;
  mine: boolean;
  /** Whose card it is, after the name ("opponent's", "Opponent 2's"). */
  owner: string;
}) {
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
      aria-label={`${name} ${label}${mine ? '' : `, ${owner}`}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusing a chip previews the card for keyboard users
      tabIndex={0}
      {...hover}
    >
      <b>{name}</b> <span>{label}</span>
      {mine ? null : <span> {`(${owner})`}</span>}
    </li>
  );
}

export function OtherZonesStrip({ view, exile }: { view: GameView; exile?: ExilePlayable }) {
  const ix = useInteraction();
  // A card the strip at the right lists as playable is not listed a second time here.
  const { cards: shown } = exile ?? exilePlayable(view, ix.clickable);
  const shownCast = new Set(shown.map((o) => o.id));
  const status = view.exile.filter((o) => !shownCast.has(o.id) && exileMarks(o).length > 0);
  if (status.length === 0) return null;
  return (
    <ul className="board-exile-strip" aria-label="Suspended and foretold cards in exile">
      {status.map((o) => (
        <StatusChip
          key={o.id}
          object={o}
          mine={o.owner === view.viewer}
          owner={bareMidPossessiveOf(o.owner, view.viewer, view.seats.length)}
        />
      ))}
    </ul>
  );
}
