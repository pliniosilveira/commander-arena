import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { autostartAi } from './game/autostart';
import { createWorkerClient } from './game/client';
import { autostartAiDelay, withSlowOpponent } from './game/slow-opponent';
import { createImportEnvironment } from './import';
import { animationGate } from './policy/animation-gate';
import { createPrecons, SHIPPED, startOptionsFor } from './precons';
import { createAppStore } from './store';
import { ImportProvider } from './ui/import/import-context';
import { applyStoredCombatAnimations } from './ui/panels/animations';
import { applyStoredSidePanel } from './ui/panels/side-panel';
import { applyStoredTextSize } from './ui/panels/text-size';
import { PreconsProvider } from './ui/precons-context';
import { StoreProvider } from './ui/store-context';
import './styles.css';

applyStoredTextSize();
applyStoredSidePanel();
applyStoredCombatAnimations();
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
// `&aidelay=<ms>` (with `?autostart`, test seam of D-174) holds back the answers in which the AI acted.
const params = new URLSearchParams(window.location.search);
const aiDelay = params.get('autostart') === null ? null : autostartAiDelay(params);
const worker = createWorkerClient();
const client = aiDelay === null ? worker : withSlowOpponent(worker, aiDelay);
const store = createAppStore({ client, autoPassDelayMs: 160, animationGate });
const importEnvironment = createImportEnvironment();

// The precons also know the player's saved decks and edited precons (D-215).
const precons = createPrecons(SHIPPED.snapshots, (client) => importEnvironment.serviceFor(client), {
  decks: importEnvironment.decks,
  client: importEnvironment.client,
});
for (const problem of SHIPPED.problems) console.warn(`Precon snapshot skipped: ${problem}`);

// `?autostart=<humanDeck>,<aiDeck>&seed=<n>[&freeMulligan=0][&ai=casual|normal]` skips the menu: used by the Playwright tests and for
// quick manual checks. An id is a real precon (prepared and checked like an imported deck, D-137)
// or, the one deliberate exception, a hidden test deck of game/precons.ts.
// The opponent of an autostart is `casual` unless `&ai=` names another (`game/autostart.ts`, D-164).
const autostart = params.get('autostart')?.split(',');
if (autostart?.length === 2) {
  const [humanDeck, aiDeck] = autostart;
  if (humanDeck !== undefined && aiDeck !== undefined) {
    const seed = Number(params.get('seed') ?? 1);
    void startOptionsFor(precons, {
      seed,
      humanDeck,
      aiDeck,
      freeMulligan: params.get('freeMulligan') !== '0',
      ai: autostartAi(params),
      allowHidden: true,
    }).then((result) => {
      if (result.ok) void store.getState().startGame(result.options);
      else store.getState().fail(result.reason);
    });
  }
}

createRoot(container).render(
  <StrictMode>
    <StoreProvider store={store}>
      <ImportProvider environment={importEnvironment}>
        <PreconsProvider precons={precons}>
          <App />
        </PreconsProvider>
      </ImportProvider>
    </StoreProvider>
  </StrictMode>,
);
