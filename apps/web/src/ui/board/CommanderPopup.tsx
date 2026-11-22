/**
 * The commander popup of the table board: opened from the commander chip of a player's strip. It shows
 * the commander large with its tax, the commander damage the player has taken, and a row for every
 * other player with the name of their commander. A commander that can be cast has a Cast button here
 * (on the 1v1 board the chip itself casts it). Esc closes it before the decision layer sees the key,
 * as the zone viewer does.
 */
import type { GameView } from '@commander-arena/engine';
import { useEffect } from 'react';
import './commander.css';
import { Dialog } from '../decisions/Dialog';
import { useInteraction } from '../interaction';
import { CardFace } from './CardFace';
import { commanderPopup } from './commander-popup-model';
import { COMMANDER_DAMAGE_LOSS } from './PlayerStrip';

export function CommanderPopup({
  view,
  seatId,
  onClose,
}: {
  view: GameView;
  seatId: number;
  onClose: () => void;
}) {
  const ix = useInteraction();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const seat = view.seats.find((s) => s.id === seatId);
  if (seat === undefined) return null;
  const popup = commanderPopup(view, seat);
  const castable = popup.commanders.filter((o) => ix.clickable.has(o.id));
  return (
    <Dialog label={`${popup.label} commander`} className="cmdr-dialog">
      <div className="cmdr-main">
        <section className="cmdr-section" aria-labelledby="cmdr-h-commander">
          <h2 className="cmdr-heading" id="cmdr-h-commander">
            {popup.label === 'You' ? 'Your Commander' : `${popup.label}'s Commander`}
          </h2>
          {popup.commanders.length === 0 ? (
            <p className="board-dim">The commander is not in a zone you can see.</p>
          ) : (
            popup.commanders.map((o, i) => (
              <figure className="cmdr-card" key={o.id} data-object-id={o.id}>
                <CardFace object={o} variant="full" />
                <figcaption className={(popup.taxes[i] ?? 0) > 0 ? '' : 'board-dim'}>
                  Commander tax +{popup.taxes[i] ?? 0}
                </figcaption>
              </figure>
            ))
          )}
        </section>
        <section className="cmdr-section cmdr-damage" aria-labelledby="cmdr-h-damage">
          <h2 className="cmdr-heading" id="cmdr-h-damage">
            Commander Damage Taken
          </h2>
          <p
            className={popup.damageTaken > 0 ? 'board-warn' : 'board-dim'}
            title={`Commander damage taken from every commander together. ${COMMANDER_DAMAGE_LOSS} from one commander loses the game (CR 704.6c).`}
          >
            Total from all commanders: {popup.damageTaken}
          </p>
          <ul className="cmdr-list" aria-label="The other players and their commanders">
            {popup.others.map((o) => (
              <li key={o.seat} className={o.lost ? 'board-dim' : ''} data-popup-seat={o.seat}>
                <b>{o.label}</b>
                <span>
                  {o.commanders.length === 0 ? 'commander not shown' : o.commanders.join(' / ')}
                </span>
                {o.lost && <em>out</em>}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="dec-buttons">
        {castable.map((o) => (
          <button
            type="button"
            key={o.id}
            className="dec-btn dec-btn-primary"
            data-commander-cast={o.id}
            onClick={() => {
              onClose();
              ix.onObject(o.id);
            }}
          >
            Cast {o.name}
          </button>
        ))}
        <button type="button" className="dec-btn" data-commander-close onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
