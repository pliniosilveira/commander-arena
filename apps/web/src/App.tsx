import { lazy, Suspense, useState } from 'react';
import { Board } from './ui/board/Board';
import { CombatEffects } from './ui/board/CombatEffects';
import { PreviewPanel } from './ui/board/PreviewPanel';
import { DecisionLayer } from './ui/decisions/DecisionLayer';
import { DockSlotContext } from './ui/decisions/dock-slot';
import { LogPanel } from './ui/panels/LogPanel';
import { SettingsPanel } from './ui/panels/SettingsPanel';
import { StackPanel } from './ui/panels/StackPanel';
import { TurnTracker } from './ui/panels/TurnTracker';
import { GameOver } from './ui/screens/GameOver';
import { HonestyBanner } from './ui/screens/HonestyBanner';
import { Menu } from './ui/screens/Menu';
import { useApp } from './ui/store-context';
import { VERSION_INFO, versionLine } from './version';

// The import screen pulls in the card pipeline (zod, the parser, the Scryfall client): load it on demand.
const ImportScreen = lazy(() =>
  import('./ui/import/ImportScreen').then((m) => ({ default: m.ImportScreen })),
);

const FAN_NOTICE =
  'Commander Arena is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC. Card images from Scryfall.';

/**
 * The legal notice under every screen; the start screen adds the versions of the build (issue 104,
 * D-215) so a player can tell whether they run the latest app, engine and card parser.
 */
export function Footer({ showVersion = false }: { showVersion?: boolean }) {
  return (
    <footer className="fan-notice">
      <small>{FAN_NOTICE}</small>
      {showVersion && (
        <small
          className="fan-version"
          data-testid="app-version"
          title="App build: the git commit and its date. Engine and card parser: the version numbers of the rules engine and of the Oracle text parser."
        >
          {versionLine(VERSION_INFO)}
        </small>
      )}
    </footer>
  );
}

/**
 * The game screen (issue 47): the battlefield in the middle with a column on each side. One holds
 * the highlighted card (tall enough for a whole card with its abilities and state) and the log; the
 * other holds the stack at the top and the action dock at the bottom, above the settings at its foot
 * (D-146: the buttons keep their place while the stack grows and shrinks). The Side panel setting says which side the stack and
 * controls are on (the right, by default). Below `--narrow` (styles.css) the two columns are one
 * drawer over the board, opened with a button that shows how many objects are on the stack.
 */
function Game() {
  const [drawer, setDrawer] = useState(false);
  // The decision layer draws the action dock into the column of the stack (`dock-slot.ts`).
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  const stackSize = useApp((s) => s.snapshot?.view.stack.length ?? 0);
  return (
    <div className="game" data-testid="game" data-drawer={drawer ? 'open' : 'closed'}>
      <DockSlotContext.Provider value={dockSlot}>
        <div className="game-main">
          <TurnTracker />
          <DecisionLayer>
            <Board />
          </DecisionLayer>
        </div>
        <button
          type="button"
          className="game-drawer-toggle"
          aria-expanded={drawer}
          aria-controls="game-sides"
          onClick={() => setDrawer(!drawer)}
        >
          {drawer ? 'Hide panels' : 'Stack, controls, card and log'}
          {!drawer && stackSize > 0 && <span className="pnl-count">{stackSize}</span>}
        </button>
        <div className="game-sides" id="game-sides">
          <div className="game-side game-side-controls" data-testid="game-side-controls">
            <StackPanel />
            <div className="game-dock-slot" ref={setDockSlot} />
            <SettingsPanel />
          </div>
          <div className="game-side game-side-info" data-testid="game-side-info">
            <PreviewPanel />
            <LogPanel />
          </div>
        </div>
      </DockSlotContext.Provider>
      <HonestyBanner />
      <GameOver />
      <CombatEffects />
    </div>
  );
}

export function App() {
  const screen = useApp((s) => s.screen);
  // `data-settled` is true when a game is on screen and nothing is in flight: the view is the one
  // the game waits on. The Playwright tests act only then (e2e/harness/settle.ts).
  const settled = useApp((s) => s.screen === 'playing' && s.snapshot !== null && !s.busy);
  const revision = useApp((s) => s.snapshot?.revision ?? 0);
  return (
    <div className="app" data-settled={settled} data-revision={revision}>
      {screen === 'menu' ? (
        <Menu />
      ) : screen === 'import' ? (
        <Suspense fallback={<p className="loading">Loading…</p>}>
          <ImportScreen />
        </Suspense>
      ) : screen === 'loading' ? (
        <p className="loading">Shuffling…</p>
      ) : (
        <Game />
      )}
      <Footer showVersion={screen === 'menu'} />
    </div>
  );
}
