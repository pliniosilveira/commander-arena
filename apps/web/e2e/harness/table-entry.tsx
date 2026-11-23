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
/** Each seat's commander, in its command zone; seat 0's has been cast twice (tax +4). */
const COMMANDERS = ['Isamaru, Hound of Konda', 'Serra Angel', 'Giant Spider', 'Grizzly Bears'];
const FIELDS: readonly (readonly string[])[] = [
  ['Island', 'Island', 'Island', 'Grizzly Bears', 'Serra Angel', 'Sol Ring'],
  ['Forest', 'Forest', 'Giant Spider', 'Grizzly Bears'],
  ['Swamp', 'Swamp', 'Swamp', 'Serra Angel', 'Grizzly Bears'],
  ['Island', 'Forest', 'Giant Spider'],
];

const COMBAT_FIELDS: readonly (readonly string[])[] = [
  ['Giant Spider'],
  ['Grizzly Bears', 'Serra Angel'],
  ['Forest'],
  ['Island'],
];

/**
 * `combat`: seat 1 attacks with Grizzly Bears (at you) and Serra Angel (at seat 2), and you block the
 * Bears with Giant Spider, so the view is of a declared four-player combat.
 */
export function mount(opponents: number, lost: readonly number[] = [], combat = false): void {
  const b = scenario({ seats: opponents + 1 });
  for (let seat = 0; seat <= opponents; seat++) {
    b.seat(seat)
      .life(lost.includes(seat) ? 0 : 40)
      .library(...FILLER)
      .commander(COMMANDERS[seat] ?? 'Grizzly Bears', seat === 0 ? { casts: 2 } : {})
      .battlefield(...((combat ? COMBAT_FIELDS[seat] : FIELDS[seat]) ?? []));
    if (seat === 0) b.hand('Lightning Bolt', 'Grizzly Bears', 'Island', 'Sol Ring');
  }
  const g = b.at('precombatMain', { active: combat ? 1 : 0 }).build();
  if (combat) {
    g.advanceTo('declareAttackers');
    g.act(1).declareAttackers([
      { attacker: 'Grizzly Bears', target: { player: 0 } },
      { attacker: 'Serra Angel', target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(0).declareBlockers([{ blocker: 'Giant Spider', attacker: 'Grizzly Bears' }]);
  }
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
