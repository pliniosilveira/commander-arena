import { lazy, Suspense, useState } from 'react';
import { Board } from './ui/board/Board';
import { CombatEffects } from './ui/board/CombatEffects';
import { PreviewPanel } from './ui/board/PreviewPanel';
import { DecisionLayer } from './ui/decisions/DecisionLayer';
import { DockSlotContext } from './ui/decisions/dock-slot';
import { LogDock } from './ui/panels/LogDock';
import { SettingsDock } from './ui/panels/SettingsDock';
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
 * The game screen: the battlefield takes the whole width. Over it float the turn box (top left: the
 * turn, priority and three steps), the turn panel (right edge: the decision and the action buttons,
 * then the stack), the card preview (left edge, only while a card is read) and, behind the buttons
 * at the bottom left, the log and the settings. The decision layer draws the action dock into the turn panel (`dock-slot.ts`).
 */
function Game() {
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  return (
    <div className="game" data-testid="game">
      <DockSlotContext.Provider value={dockSlot}>
        <div className="game-main">
          <DecisionLayer>
            <Board />
          </DecisionLayer>
        </div>
        <aside className="turn-panel" aria-label="Turn" data-testid="turn-panel">
          <div className="game-dock-slot" ref={setDockSlot} />
          <StackPanel />
        </aside>
      </DockSlotContext.Provider>
      <TurnTracker />
      <PreviewPanel />
      <LogDock />
      <SettingsDock />
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
    <div className="app" data-screen={screen} data-settled={settled} data-revision={revision}>
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
