import type { GameResult } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type {
  GameClient,
  GameStarted,
  HonestySummary,
  LogEntry,
  NewGameOptions,
} from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { PreconsProvider } from '../src/ui/precons-context';
import { GameOver } from '../src/ui/screens/GameOver';
import { lossReason, outcomeFor } from '../src/ui/screens/game-over-model';
import { HonestyBanner } from '../src/ui/screens/HonestyBanner';
import { honestyLines } from '../src/ui/screens/honesty-model';
import { Menu } from '../src/ui/screens/Menu';
import { defaultDecks, parseSeed } from '../src/ui/screens/menu-model';
import { StoreProvider } from '../src/ui/store-context';
import { playableSnapshot, preconsOf } from './precons-helpers';

type Store = ReturnType<typeof createAppStore>;

// zustand renders the server snapshot from `getInitialState`; make the current state the one used.
const html = (store: Store, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

const gameOptions: NewGameOptions = { seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' };

async function startedStore(summary?: HonestySummary): Promise<Store> {
  const host = new GameHost({ clock: () => 0 });
  const client: GameClient = summary
    ? {
        newGame: async (o): Promise<GameStarted> => ({ ...(await host.newGame(o)), summary }),
        act: (a) => host.act(a),
        undo: () => host.undo(),
      }
    : host;
  const store = createAppStore({ client });
  await store.getState().startGame(gameOptions);
  return store;
}

async function endedStore(result: GameResult, log: readonly LogEntry[] = []): Promise<Store> {
  const store = await startedStore();
  const snap = store.getState().snapshot;
  if (snap === null) throw new Error('no snapshot');
  store.setState({ snapshot: { ...snap, view: { ...snap.view, result } }, log });
  return store;
}

const lost = (id: number, seat: number, reason: string): LogEntry => ({
  id,
  turn: 5,
  seat,
  level: 'major',
  text: `${seat === 0 ? 'You lose' : 'The opponent loses'} the game (${reason}).`,
  objects: [],
  rule: 'CR 104.3',
});

describe('Menu', () => {
  test('the AI defaults to the second precon, so the first game is not a mirror match', () => {
    expect(defaultDecks(['zombies', 'artifacts'])).toEqual({
      humanDeck: 'zombies',
      aiDeck: 'artifacts',
    });
    expect(defaultDecks(['zombies'])).toEqual({ humanDeck: 'zombies', aiDeck: 'zombies' });
    expect(defaultDecks([])).toEqual({ humanDeck: '', aiDeck: '' });
  });

  test('lists only the real precons for both seats, with the commander, and the start button', async () => {
    const snapshot = await playableSnapshot('synthetic-a');
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const out = html(
      store,
      <PreconsProvider precons={preconsOf([snapshot])}>
        <Menu />
      </PreconsProvider>,
    );
    expect(out.split(snapshot.name).length - 1).toBe(2);
    expect(out).toContain('Commander: Synthetic Commander');
    expect(out).toContain('Quick start');
    expect(out).toContain('Your deck');
    expect(out).toContain('Opponent&#x27;s deck');
    expect(out).toContain('unofficial');
    expect(out).toContain('Start game');
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>Start game/);
    expect(out).toContain('How to play this build');
    expect(out).not.toContain('<details open');
    expect(out).toContain('name="human-deck"');
    expect(out).toContain('name="ai-deck"');
    expect(out).not.toContain('Test deck');
    // The hidden test decks never show.
    for (const hidden of ['Knights and Angels', 'Rats and Spiders', 'Bolts and Counterspells']) {
      expect(out).not.toContain(hidden);
    }
    expect(out).not.toContain('No precon is installed yet');
  });

  test('with no precon installed it says so and Start is disabled, without crashing', () => {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    for (const out of [
      html(store, <Menu />),
      html(
        store,
        <PreconsProvider precons={preconsOf([])}>
          <Menu />
        </PreconsProvider>,
      ),
    ]) {
      expect(out).toContain('No precon is installed yet');
      expect(out).not.toContain('type="radio"');
      expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Start game/);
      expect(out).toContain('Import a deck');
    }
  });

  test('the seed rules', () => {
    expect(parseSeed('4294967295')).toEqual({ ok: true, seed: 4294967295 });
    expect(parseSeed('')).toEqual({ ok: true, seed: null });
    expect(parseSeed(' 7 ')).toEqual({ ok: true, seed: 7 });
    expect(parseSeed('1e3')).toEqual({ ok: false });
  });
});

describe('GameOver', () => {
  test('renders nothing while the game is running', async () => {
    expect(html(await startedStore(), <GameOver />)).toBe('');
  });

  test('a win', async () => {
    const out = html(await endedStore({ kind: 'win', winner: 0 }), <GameOver />);
    expect(out).toContain('You win');
    expect(out).toContain('role="dialog"');
    expect(out).not.toContain('Download replay');
    expect(out).toContain('Back to menu');
    expect(out).toContain('Keep looking at the board');
  });

  test('a loss with the reason from the log', async () => {
    const store = await endedStore({ kind: 'win', winner: 1 }, [lost(9, 0, 'life')]);
    const out = html(store, <GameOver />);
    expect(out).toContain('You lose');
    expect(out).toContain('You were reduced to 0 life.');
  });

  test('a draw has no reason', async () => {
    const out = html(await endedStore({ kind: 'draw' }), <GameOver />);
    expect(out).toContain('Draw');
    expect(out).not.toContain('scr-over-reason');
  });

  test('outcome and reason text', () => {
    expect(outcomeFor({ kind: 'win', winner: 0 }, 0)).toBe('win');
    expect(outcomeFor({ kind: 'win', winner: 1 }, 0)).toBe('lose');
    expect(outcomeFor({ kind: 'draw' }, 0)).toBe('draw');
    const win: GameResult = { kind: 'win', winner: 0 };
    expect(lossReason([lost(1, 1, 'concede')], win, 0)).toBe('The opponent conceded.');
    expect(lossReason([lost(1, 1, 'commanderDamage')], win, 0)).toContain('commander');
    expect(lossReason([], win, 0)).toBeNull();
    expect(lossReason([lost(1, 1, 'life')], { kind: 'draw' }, 0)).toBeNull();
    expect(lossReason([lost(1, 1, 'mystery')], win, 0)).toBeNull();
  });
});

describe('HonestyBanner (A28)', () => {
  test('renders nothing when every card is supported', async () => {
    expect(html(await startedStore(), <HonestyBanner />)).toBe('');
    expect(html(await startedStore({ unsupported: [] }), <HonestyBanner />)).toBe('');
  });

  test('lists each unsupported card with its count and seat', async () => {
    const summary: HonestySummary = {
      unsupported: [
        { seat: 0, name: 'Synthetic Wonder', count: 2 },
        { seat: 1, name: 'Synthetic Marvel', count: 1 },
      ],
    };
    const out = html(await startedStore(summary), <HonestyBanner />);
    expect(out).toContain('These cards use abilities the engine cannot run');
    expect(out).toContain('2× Synthetic Wonder (You)');
    expect(out).toContain('1× Synthetic Marvel (Opponent)');
    expect(out).toContain('Dismiss');
    expect(honestyLines(null, 0)).toEqual([]);
  });
});
