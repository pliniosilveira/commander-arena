import { OPPONENT_ORDINALS } from '../screens/menu-model';
import { useApp } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { Dialog } from './Dialog';
import { Side } from './Versus';

/**
 * The screen before a game with several opponents: your deck, then each opponent's deck, face to
 * face. Start game opens the (still empty) board, Cancel goes back to the menu.
 */
export function TableVersus({ onStart }: { onStart: () => void }) {
  const table = useApp((s) => s.table);
  const backToMenu = useApp((s) => s.backToMenu);
  const { choices } = useDeckChoices();
  if (table === null) return null;
  const count = table.opponentDecks.length;
  return (
    <Dialog label="Versus" className="dec-intro dec-intro-table" popup>
      <div className="dec-versus-wrap">
        <div className="dec-versus dec-versus-table" data-versus data-versus-opponents={count}>
          <Side
            who="you"
            label="You"
            deck={choices.find((d) => d.id === table.humanDeck)}
            fallbackCommander=""
            fallbackColors={[]}
          />
          {table.opponentDecks.map((id, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same deck may sit in two seats
            <div className="dec-versus-seat" key={index}>
              <span className="dec-versus-x" role="img" aria-label="versus">
                ×
              </span>
              <Side
                who={`opponent-${index + 1}`}
                label={`${count === 1 ? '' : `${capitalize(OPPONENT_ORDINALS[index] ?? '')} `}Opponent`}
                deck={choices.find((d) => d.id === id)}
                fallbackCommander=""
                fallbackColors={[]}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="dec-buttons">
        <button
          type="button"
          className="dec-btn dec-btn-primary"
          data-intro-start
          onClick={onStart}
        >
          Start game
        </button>
        <button type="button" className="dec-btn" data-intro-cancel onClick={backToMenu}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
