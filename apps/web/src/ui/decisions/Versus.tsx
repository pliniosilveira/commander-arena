import type { GameView } from '@commander-arena/engine';
import type { DeckChoice } from '../../precons';
import { ManaCost } from '../mana';
import { useApp } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';

/** One side of the versus card: the deck as the deck picker shows it (art, name, commander). */
function Side({
  who,
  deck,
  fallbackCommander,
  fallbackColors,
}: {
  who: 'you' | 'opponent';
  deck: DeckChoice | undefined;
  fallbackCommander: string;
  fallbackColors: readonly string[];
}) {
  const commander = deck?.commander || fallbackCommander;
  const colors = deck?.colors ?? fallbackColors;
  return (
    <div className="dec-versus-side" data-versus-side={who}>
      {deck?.commanderImage !== undefined && (
        <img className="dec-versus-art" src={deck.commanderImage} alt="" width={96} height={70} />
      )}
      <span className="dec-versus-text">
        <span className="dec-versus-who">{who === 'you' ? 'You' : 'Opponent'}</span>
        {deck !== undefined && <span className="dec-versus-name">{deck.name}</span>}
        <span className="dec-versus-commander">
          {commander === '' ? 'No commander' : `Commander: ${commander}`}
        </span>
      </span>
      <span className="dec-versus-colors">
        <ManaCost cost={colors.length === 0 ? ['C'] : colors} />
      </span>
    </div>
  );
}

/**
 * "[Your deck] x [Opponent's deck]" above the opening hand, with a Cancel that leaves the game, so a
 * hand is judged knowing both decks. The decks come from the deck picker's list; a deck that is not
 * in it (a hidden test deck) shows its commander from the command zone, without art.
 */
export function Versus({ view }: { view: GameView }) {
  const options = useApp((s) => s.options);
  const backToMenu = useApp((s) => s.backToMenu);
  const { choices } = useDeckChoices();
  const commanderOf = (seat: GameView['seats'][number] | undefined) =>
    seat?.command.find((o) => o.emblem !== true);
  const mine = commanderOf(view.seats.find((s) => s.id === view.viewer));
  const theirs = commanderOf(view.seats.find((s) => s.id !== view.viewer));
  return (
    <div className="dec-versus-wrap">
      <div className="dec-versus" data-versus>
        <Side
          who="you"
          deck={choices.find((d) => d.id === options?.humanDeck)}
          fallbackCommander={mine?.name ?? ''}
          fallbackColors={mine?.colors ?? []}
        />
        <span className="dec-versus-x" role="img" aria-label="versus">
          ×
        </span>
        <Side
          who="opponent"
          deck={choices.find((d) => d.id === options?.aiDeck)}
          fallbackCommander={theirs?.name ?? ''}
          fallbackColors={theirs?.colors ?? []}
        />
      </div>
      <button type="button" className="dec-btn dec-versus-cancel" onClick={backToMenu}>
        Cancel
      </button>
    </div>
  );
}
