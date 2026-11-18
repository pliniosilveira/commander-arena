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
import { DeckDialog } from '../src/ui/screens/DeckDialog';
import { GameOver } from '../src/ui/screens/GameOver';
import { lossReason, outcomeFor } from '../src/ui/screens/game-over-model';
import { HonestyBanner } from '../src/ui/screens/HonestyBanner';
import { honestyLines } from '../src/ui/screens/honesty-model';
import { Menu } from '../src/ui/screens/Menu';
import {
  defaultDecks,
  matchesColorFilter,
  parseSeed,
  pickRandomDeck,
  toggleColorFilter,
} from '../src/ui/screens/menu-model';
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

  test('the home has the two cards, the seed settings and no deck list', async () => {
    const snapshot = await playableSnapshot('synthetic-a');
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    const out = html(
      store,
      <PreconsProvider precons={preconsOf([snapshot])}>
        <Menu />
      </PreconsProvider>,
    );
    expect(out).toContain('unofficial');
    expect(out).toContain('Play a game');
    expect(out).toContain('Start game');
    expect(out).toContain('My Decks');
    expect(out).toContain('Seed');
    expect(out).toContain('Free first mulligan');
    expect(out).not.toContain('Import a deck');
    expect(out).not.toContain('role="dialog"');
    expect(out).not.toContain(snapshot.name);
    expect(out).toContain('How to play this build');
    expect(out).not.toContain('<details open');
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>Start game/);
  });

  test('with no precon installed the home says so and Start is disabled, without crashing', () => {
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
      expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Start game/);
      expect(out).toContain('My Decks');
    }
  });

  test('a deck dialog lists the precons in one tab and the saved decks in the other', () => {
    const decks = [
      {
        id: 'p1',
        kind: 'precon',
        name: 'Precon One',
        blurb: 'b',
        commander: 'Cmd One',
        edited: false,
      },
      { id: 's1', kind: 'saved', name: 'Saved One', blurb: 'b', commander: '', edited: false },
    ] as const;
    const dialog = (
      list: typeof decks | readonly [(typeof decks)[0]],
      value: string,
      initialTab?: 'saved' | 'precon',
    ) =>
      renderToStaticMarkup(
        <DeckDialog
          title="Choose your deck"
          name="human-deck"
          value={value}
          prompt="Select the deck you'll play in this game."
          decks={list}
          {...(initialTab === undefined ? {} : { initialTab })}
          error={null}
          busy={false}
          onChoose={() => undefined}
          onCancel={() => undefined}
          onImport={() => undefined}
        />,
      );
    // The dialog opens on the tab of the marked deck.
    const withSaved = dialog(decks, 's1');
    expect(withSaved).toContain('role="dialog"');
    expect(withSaved).toContain('Choose your deck');
    expect(withSaved).toContain('Saved One');
    expect(withSaved).toContain('No commander marked');
    expect(withSaved).not.toContain('Precon One');
    const onlyPrecons = dialog([decks[0]], 'p1', 'precon');
    expect(onlyPrecons).toContain('Precon One');
    expect(onlyPrecons).toContain('Commander: Cmd One');
    expect(onlyPrecons).not.toContain('Back');
    expect(onlyPrecons).toContain('>Select<');
    expect(onlyPrecons).toContain('aria-label="Search decks"');
    for (const label of ['Random all', 'Random precon', 'Random mine'])
      expect(onlyPrecons).toContain(label);
    // No deck was saved: its random button is disabled.
    expect(onlyPrecons).toMatch(/<button[^>]*disabled=""[^>]*>Random mine/);
    expect(onlyPrecons).not.toMatch(/<button[^>]*disabled=""[^>]*>Random precon/);
    expect(onlyPrecons).toContain('name="human-deck"');
  });

  test('the random buttons pick from the whole list, the precons or the saved decks', () => {
    const deck = (id: string, kind: 'precon' | 'saved') =>
      ({ id, kind, name: id, blurb: '', commander: '', edited: false }) as const;
    const decks = [deck('p1', 'precon'), deck('p2', 'precon'), deck('s1', 'saved')];
    const last = (n: number) => n - 1;
    expect(pickRandomDeck(decks, 'all', last)?.id).toBe('s1');
    expect(pickRandomDeck(decks, 'all', () => 0)?.id).toBe('p1');
    expect(pickRandomDeck(decks, 'precon', last)?.id).toBe('p2');
    expect(pickRandomDeck(decks, 'saved', last)?.id).toBe('s1');
    expect(pickRandomDeck([decks[0] as (typeof decks)[0]], 'saved', last)).toBeNull();
    expect(pickRandomDeck([], 'all', last)).toBeNull();
    // The browser's own source always lands inside the list.
    expect(['p1', 'p2']).toContain(pickRandomDeck(decks, 'precon')?.id);
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

describe('the deck color filter', () => {
  test('matches the exact color identity', () => {
    expect(matchesColorFilter(['R'], [])).toBe(true);
    expect(matchesColorFilter(['R'], ['R'])).toBe(true);
    expect(matchesColorFilter(['U', 'R'], ['R'])).toBe(false);
    expect(matchesColorFilter(['U', 'R'], ['R', 'U'])).toBe(true);
    expect(matchesColorFilter([], ['C'])).toBe(true);
    expect(matchesColorFilter(['G'], ['C'])).toBe(false);
    expect(matchesColorFilter(undefined, ['R'])).toBe(false);
  });

  test('colorless and the colors exclude each other', () => {
    expect(toggleColorFilter(['R'], 'C')).toEqual(['C']);
    expect(toggleColorFilter(['C'], 'U')).toEqual(['U']);
    expect(toggleColorFilter(['R', 'U'], 'R')).toEqual(['U']);
  });
});
