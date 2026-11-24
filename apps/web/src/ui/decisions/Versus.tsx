import type { GameView } from '@commander-arena/engine';
import type { DeckChoice } from '../../precons';
import { Art } from '../board/art';
import { ManaCost } from '../mana';
import { useApp } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';

/** One side of the versus card: the deck as the deck picker shows it (art, name, commander). */
export function Side({
  who,
  seat,
  label,
  deck,
  fallbackCommander,
  fallbackColors,
}: {
  who: string;
  /** The seat that plays the deck: its commander is drawn in the printing its list names. */
  seat: number;
  /** The caption above the deck name. */
  label: string;
  deck: DeckChoice | undefined;
  fallbackCommander: string;
  fallbackColors: readonly string[];
}) {
  const commander = deck?.commander || fallbackCommander;
  const colors = deck?.colors ?? fallbackColors;
  return (
    <div className="dec-versus-side" data-versus-side={who}>
      {commander !== '' && (
        // No search for a special commander printing here: the deck's own printing (the one chosen for it, or its list's) is drawn.
        <Art
          name={commander}
          isToken={false}
          owner={seat}
          version="normal"
          className="dec-versus-card"
        />
      )}
      <span className="dec-versus-text">
        <span className="dec-versus-who">{label}</span>
        <span className="dec-versus-name">{deck?.name ?? commander}</span>
        {deck !== undefined && (
          <span className="dec-versus-commander">
            {commander === '' ? 'No commander' : `Commander: ${commander}`}
          </span>
        )}
      </span>
      <span className="dec-versus-colors">
        <ManaCost cost={colors.length === 0 ? ['C'] : colors} />
      </span>
    </div>
  );
}

/**
 * "[Your deck] x [Opponent's deck]": both decks as tall cells with the full commander card. The decks come
 * from the deck picker's list; a deck that is not in it (a hidden test deck) shows its commander
 * from the command zone, without art.
 */
export function Versus({ view }: { view: GameView }) {
  const options = useApp((s) => s.options);
  const { choices } = useDeckChoices();
  const commanderOf = (seat: GameView['seats'][number] | undefined) =>
    seat?.command.find((o) => o.emblem !== true);
  const mine = commanderOf(view.seats.find((s) => s.id === view.viewer));
  const theirSeat = view.seats.find((s) => s.id !== view.viewer);
  const theirs = commanderOf(theirSeat);
  // The emblems the opponent starts with (the Medium and Hard challenges), beside its deck.
  const emblems = theirSeat?.command.filter((o) => o.emblem === true) ?? [];
  return (
    <div className="dec-versus-wrap">
      <div className="dec-versus" data-versus>
        <Side
          who="you"
          seat={view.viewer}
          label="You"
          deck={choices.find((d) => d.id === options?.humanDeck)}
          fallbackCommander={mine?.name ?? ''}
          fallbackColors={mine?.colors ?? []}
        />
        <span className="dec-versus-x" role="img" aria-label="versus">
          ×
        </span>
        <div className="dec-versus-opponent">
          <Side
            who="opponent"
            seat={theirSeat?.id ?? 1}
            label="Opponent"
            deck={choices.find((d) => d.id === options?.aiDeck)}
            fallbackCommander={theirs?.name ?? ''}
            fallbackColors={theirs?.colors ?? []}
          />
          {emblems.length > 0 && (
            <div className="dec-versus-emblems" data-versus-emblems>
              <h3 className="dec-versus-emblems-title">Opponent's emblems</h3>
              <ul className="dec-versus-emblem-list">
                {emblems.map((emblem) => (
                  <li key={emblem.id}>{emblem.oracleText}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
