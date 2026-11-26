/**
 * The "That was a dumb move" control of the game log (issue 627), rendered: the toggle in the log bar, the mark on each AI move, and
 * the form that asks which move and what it should have done. The log lines are SYNTHETIC.
 */
import type { GameRecord } from '@commander-arena/cards';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { LogEntry } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { DumbMoveForm } from '../src/ui/panels/DumbMove';
import { LogPanel } from '../src/ui/panels/LogPanel';
import { StoreProvider } from '../src/ui/store-context';

async function startedStore() {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  return store;
}

const html = (store: Awaited<ReturnType<typeof startedStore>>, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

const line = (id: number, seat: number, text: string, index?: number): LogEntry => ({
  id,
  turn: 2,
  activeSeat: 1,
  round: 1,
  seat,
  level: 'major',
  text,
  objects: [],
  rule: null,
  ...(index === undefined ? {} : { action: { index, seat } }),
});

const moves = [
  {
    index: 12,
    seat: 1,
    text: 'Opponent attacks you with Synthetic Bear.',
    turn: "Opponent's turn 2",
  },
  { index: 9, seat: 1, text: 'Opponent plays Swamp.', turn: "Opponent's turn 2" },
];

const record: GameRecord = {
  seed: 7,
  freeMulligan: true,
  ai: 'normal',
  decks: [
    { name: 'a', hidden: 'white-knights' },
    { name: 'b', hidden: 'swamp-forest' },
  ],
  emblems: [],
  actions: [],
};

describe('the log', () => {
  test('offers the report next to the AI moves only, once a move of the AI is in the log', async () => {
    const store = await startedStore();
    store.setState({ log: [line(1, 0, 'You play Plains.', 3)] });
    expect(html(store, <LogPanel />)).not.toContain('That was a dumb move');
    store.setState({
      log: [
        line(1, 0, 'You play Plains.', 3),
        line(2, 1, 'Opponent plays Swamp.', 9),
        line(3, 1, 'Opponent draws a card.'),
      ],
    });
    const out = html(store, <LogPanel />);
    expect(out).toContain('data-testid="dumb-move"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('>That was a dumb move</button>');
    // One mark, on the AI's move; none on the player's line or on a line of no action.
    expect(out.match(/aria-label="Report this move as a dumb move"/g)).toHaveLength(1);
    expect(out).toMatch(/Opponent plays Swamp\.<\/span><button[^>]*aria-label="Report this move/);
  });
});

describe('the form', () => {
  test('asks which move (the latest by default) and one optional line, with labels', async () => {
    const store = await startedStore();
    const out = html(
      store,
      <DumbMoveForm
        moves={moves}
        selected={null}
        onSelect={() => {}}
        onClose={() => {}}
        record={record}
      />,
    );
    expect(out).toContain('aria-label="Report a dumb move of the AI"');
    expect(out).toMatch(
      /<label[^>]*for="([^"]+)-move"[^>]*>Which move\?<\/label><select id="\1-move"/,
    );
    expect(out).toMatch(/<option value="12" selected="">Opponent&#x27;s turn 2: Opponent attacks/);
    expect(out).toContain('What should it have done? (optional)');
    expect(out).toContain('maxLength="280"');
    expect(out).toContain('you press Submit there');
    // The issue is prepared after the first render: the button waits for it.
    expect(out).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Open GitHub issue<\/button>/);
  });

  test('marks the move the player picked from the log', async () => {
    const store = await startedStore();
    const out = html(
      store,
      <DumbMoveForm
        moves={moves}
        selected={9}
        onSelect={() => {}}
        onClose={() => {}}
        record={record}
      />,
    );
    expect(out).toContain('<option value="9" selected="">');
  });

  test('says when the game cannot be replayed', async () => {
    const store = await startedStore();
    const out = html(
      store,
      <DumbMoveForm
        moves={moves}
        selected={null}
        onSelect={() => {}}
        onClose={() => {}}
        record={null}
      />,
    );
    expect(out).toContain('cannot be reported');
  });
});
