// Mounts the board for three or more players on a store holding a view built with the engine's
// scenario DSL (real fixture cards; no game is played), so the layout can be drawn and photographed
// before the app starts such a game. `mount(opponents)` draws one human and that many opponents.
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { createRoot } from 'react-dom/client';
import { GameHost } from '../../src/game/host';
import { createAppStore } from '../../src/store';
import { TableGame } from '../../src/ui/board/TableGame';
import { StoreProvider } from '../../src/ui/store-context';
import '../../src/styles.css';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const FIELDS: readonly (readonly string[])[] = [
  ['Island', 'Island', 'Island', 'Grizzly Bears', 'Serra Angel', 'Sol Ring'],
  ['Forest', 'Forest', 'Giant Spider', 'Grizzly Bears'],
  ['Swamp', 'Swamp', 'Swamp', 'Serra Angel', 'Grizzly Bears'],
  ['Island', 'Forest', 'Giant Spider'],
];

export function mount(opponents: number, lost: readonly number[] = []): void {
  const b = scenario({ seats: opponents + 1 });
  for (let seat = 0; seat <= opponents; seat++) {
    b.seat(seat)
      .life(lost.includes(seat) ? 0 : 40)
      .library(...FILLER)
      .battlefield(...(FIELDS[seat] ?? []));
    if (seat === 0) b.hand('Lightning Bolt', 'Grizzly Bears', 'Island', 'Sol Ring');
  }
  const g = b.at('precombatMain', { active: 0 }).build();
  if (lost.length > 0) {
    // A seat at 0 life loses the game at the next check of state-based actions (CR 704.5a): pass once.
    g.act(0).pass();
  }
  const view = getView(g.state, 0);
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  store.setState({
    screen: 'table',
    snapshot: {
      revision: 1,
      view,
      steps: [],
      log: [],
      actionCount: 0,
      aiFallbacks: 0,
      error: null,
      undoDepth: 0,
      logReset: null,
    },
  });
  const container = document.createElement('div');
  container.className = 'app';
  document.body.replaceChildren(container);
  createRoot(container).render(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>
      <TableGame />
    </StoreProvider>,
  );
}
