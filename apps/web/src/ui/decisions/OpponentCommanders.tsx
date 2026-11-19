import type { GameView } from '@commander-arena/engine';
import { Fragment } from 'react';
import { ManaCost } from '../mana';
import { useApp } from '../store-context';

/**
 * "Your opponent is playing Name (U) (B)": the commanders of the other players, which are public in
 * the command zone, with their colours (a colourless one shows {C}). Shown under the buttons of the
 * opening hand (issue 48), so a hand is judged knowing what it will face. Nothing without a commander.
 */
export function OpponentCommanders({ view }: { view: GameView }) {
  const precon = useApp((s) => s.options?.aiPreconName);
  const others = view.seats.filter((seat) => seat.id !== view.viewer);
  // The emblems of the command zone are not commanders (D-243), as in the board's command zone.
  const commanders = others.flatMap((seat) => seat.command.filter((o) => o.emblem !== true));
  if (commanders.length === 0) return null;
  if (precon !== undefined && others.length === 1) {
    // "Your opponent is playing precon X with commander Y": a precon is named, a player's own deck is not.
    return (
      <p className="dec-sub dec-opponent" data-opponent-commanders>
        Your opponent is playing precon <strong>{precon}</strong> with{' '}
        {commanders.length === 1 ? 'commander ' : 'commanders '}
        {commanders.map((o, i) => (
          <Fragment key={o.id}>
            {i === 0 ? '' : ' and '}
            <strong>{o.name}</strong> <ManaCost cost={o.colors.length === 0 ? ['C'] : o.colors} />
          </Fragment>
        ))}
      </p>
    );
  }
  return (
    <p className="dec-sub dec-opponent" data-opponent-commanders>
      {others.length === 1 ? 'Your opponent is playing ' : 'Your opponents are playing '}
      {commanders.map((o, i) => (
        <Fragment key={o.id}>
          {i === 0 ? '' : ' and '}
          <strong>{o.name}</strong> <ManaCost cost={o.colors.length === 0 ? ['C'] : o.colors} />
        </Fragment>
      ))}
    </p>
  );
}
