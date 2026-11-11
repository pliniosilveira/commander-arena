/**
 * "Opponent is thinking" (D-174): the store marks the Worker request in flight (`hostCall`) and the
 * watcher turns a request that lasts `THINKING_DELAY_MS` into the status, with a slow host and fake
 * timers; `withSlowOpponent` is the test seam that makes the opponent slow in the browser.
 */
import type { Action } from '@commander-arena/engine';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import type { GameClient, Snapshot } from '../src/game/protocol';
import { autostartAiDelay, MAX_AI_DELAY_MS, withSlowOpponent } from '../src/game/slow-opponent';
import { createAppStore } from '../src/store';
import { THINKING_DELAY_MS, watchThinking } from '../src/ui/decisions/thinking';

vi.setConfig({ testTimeout: 30_000 });

const options = { seed: 11, humanDeck: 'swamp-forest', aiDeck: 'white-knights' };

/**
 * A host whose first `slowCalls` requests answer only when the test lets them, as a long AI decision
 * would; the autopilot's later passes are quick again.
 */
function slowClient(slowCalls = 1) {
  let held = 0;
  const host = new GameHost({ clock: () => 0 });
  const gates: (() => void)[] = [];
  const client: GameClient = {
    newGame: (o) => host.newGame(o),
    undo: () => host.undo(),
    act: async (action: Action): Promise<Snapshot> => {
      const reply = await host.act(action);
      held += 1;
      if (held <= slowCalls) await new Promise<void>((resolve) => gates.push(resolve));
      return reply;
    },
  };
  return { client, release: () => gates.shift()?.() };
}

/** Lets the store's promise chain run: the fake timers do not fake microtasks. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('the status of a long wait', () => {
  afterEach(() => vi.useRealTimers());

  /** A started game, with the timers faked only afterwards: loading the test decks needs real ones. */
  async function started(slowCalls = 1) {
    const slow = slowClient(slowCalls);
    const store = createAppStore({ client: slow.client });
    await store.getState().startGame(options);
    vi.useFakeTimers();
    return { ...slow, store };
  }

  test('the request is marked while it is in flight and cleared when it ends', async () => {
    const { store, release } = await started();
    expect(store.getState().hostCall).toBeNull();
    const acting = store.getState().act({ kind: 'keepHand' });
    expect(store.getState().hostCall).not.toBeNull();
    await flush();
    release();
    await flush();
    await acting;
    expect(store.getState().hostCall).toBeNull();
  });

  test('shows after the delay, not before, and goes the instant the answer arrives', async () => {
    const { store, release } = await started();
    const seen: boolean[] = [];
    const stop = watchThinking(store, THINKING_DELAY_MS, (on) => seen.push(on));
    expect(seen).toEqual([false]);
    const acting = store.getState().act({ kind: 'keepHand' });
    await vi.advanceTimersByTimeAsync(THINKING_DELAY_MS - 1);
    expect(seen).toEqual([false]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([false, true]);
    // Still waiting a long time: nothing changes.
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual([false, true]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([false, true, false]);
    await acting;
    stop();
  });

  test('a request that ends before the delay never shows', async () => {
    const { store, release } = await started();
    const seen: boolean[] = [];
    const stop = watchThinking(store, THINKING_DELAY_MS, (on) => seen.push(on));
    const acting = store.getState().act({ kind: 'keepHand' });
    await vi.advanceTimersByTimeAsync(THINKING_DELAY_MS - 100);
    release();
    await acting;
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen).toEqual([false]);
    stop();
  });

  test('each request counts from its own start: quick requests one after another never add up', async () => {
    const { store, release } = await started(4);
    const seen: boolean[] = [];
    const stop = watchThinking(store, THINKING_DELAY_MS, (on) => seen.push(on));
    const first = store.getState().act({ kind: 'keepHand' });
    // The autopilot sends its passes right after the click: each is a request of its own, 350 ms long.
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(THINKING_DELAY_MS - 50);
      release();
      await vi.advanceTimersByTimeAsync(0);
    }
    await first;
    expect(seen.filter(Boolean)).toEqual([]);
    stop();
  });

  test('stops watching: no timer is left and the listener is quiet', async () => {
    const { store, release } = await started();
    const seen: boolean[] = [];
    const stop = watchThinking(store, THINKING_DELAY_MS, (on) => seen.push(on));
    const acting = store.getState().act({ kind: 'keepHand' });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(THINKING_DELAY_MS * 2);
    expect(seen).toEqual([false]);
    release();
    await acting;
  });

  test('a custom delay is honoured', async () => {
    const { store, release } = await started();
    const seen: boolean[] = [];
    const stop = watchThinking(store, 50, (on) => seen.push(on));
    const acting = store.getState().act({ kind: 'keepHand' });
    await vi.advanceTimersByTimeAsync(50);
    expect(seen).toEqual([false, true]);
    release();
    await acting;
    stop();
  });
});

describe('the test seam that slows the opponent', () => {
  test('autostartAiDelay reads a whole number of milliseconds and caps it', () => {
    const ms = (query: string) => autostartAiDelay(new URLSearchParams(query));
    expect(ms('aidelay=1500')).toBe(1500);
    expect(ms('aidelay=999999')).toBe(MAX_AI_DELAY_MS);
    expect(ms('')).toBeNull();
    expect(ms('aidelay=0')).toBeNull();
    expect(ms('aidelay=-5')).toBeNull();
    expect(ms('aidelay=1.5')).toBeNull();
    expect(ms('aidelay=abc')).toBeNull();
  });

  test('only an answer in which the AI acted is held back', async () => {
    const host = new GameHost({ clock: () => 0 });
    const waits: number[] = [];
    const client = withSlowOpponent(host, 700, async (ms) => void waits.push(ms));
    await client.newGame(options);
    // Keeping the hand: the human acts and then the AI answers its own questions.
    const reply = await client.act({ kind: 'keepHand' });
    const aiActed = reply.steps.some((step) => step.seat === 1);
    expect(waits).toEqual(aiActed ? [700] : []);
    // A refused action holds no step of the AI and is not held back.
    waits.length = 0;
    const refused = await client.act({ kind: 'keepHand' });
    expect(refused.error).not.toBeNull();
    expect(waits).toEqual([]);
  });
});
