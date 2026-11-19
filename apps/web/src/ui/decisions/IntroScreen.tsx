import type { GameView } from '@commander-arena/engine';
import { useApp } from '../store-context';
import { Dialog } from './Dialog';
import { Versus } from './Versus';

/**
 * The screen before the opening hand of a game started from the menu: the two decks face to face,
 * then Start game (on to the mulligan) and Cancel (back to the menu), both below them.
 */
export function IntroScreen({ view, onStart }: { view: GameView; onStart: () => void }) {
  const backToMenu = useApp((s) => s.backToMenu);
  return (
    <Dialog label="Versus" className="dec-intro" popup>
      <Versus view={view} />
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
