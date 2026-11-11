/**
 * The animation gate (D-228): the autopilot waits for the combat effects of a snapshot, never longer
 * than the cap, never without a hold, and a click of the player ends the wait at once. The store
 * test plays a real game through the real host with a gate that holds the autopilot.
 */
import type { Action } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { GameClient, NewGameOptions, Snapshot } from '../src/game/protocol';
import {
  type AnimationGate,
  createAnimationGate,
  type GateClock,
  MAX_WAIT_MS,
} from '../src/policy/animation-gate';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

/** A clock the test moves by hand. */
function manualClock(): GateClock & { advance(ms: number): void } {
  let now = 1000;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 0;
  return {
    now: () => now,
    setTimer(run, ms) {
      next += 1;
      timers.set(next, { at: now + ms, run });
      return next;
    },
    clearTimer(timer) {
      timers.delete(timer as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.run();
        }
      }
    },
  };
}

const settled = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('createAnimationGate', () => {
  test('with nothing held a wait ends at once', async () => {
    const gate = createAnimationGate(manualClock());
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  test('a wait lasts as long as the hold, no longer', async () => {
    const clock = manualClock();
    const gate = createAnimationGate(clock);
    gate.hold(1800);
    let done = false;
    void gate.wait().then(() => {
      done = true;
    });
    clock.advance(1799);
    await settled();
    expect(done).toBe(false);
    clock.advance(1);
    await settled();
    expect(done).toBe(true);
    // The hold is over: the next wait is free.
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  test('a hold is never longer than the cap, whatever the effects need', async () => {
    const clock = manualClock();
    const gate = createAnimationGate(clock);
    gate.hold(60_000);
    let done = false;
    void gate.wait().then(() => {
      done = true;
    });
    clock.advance(MAX_WAIT_MS);
    await settled();
    expect(done).toBe(true);
    expect(MAX_WAIT_MS).toBeLessThanOrEqual(2500);
  });

  test('holds do not add up: the later end wins', async () => {
    const clock = manualClock();
    const gate = createAnimationGate(clock);
    gate.hold(1000);
    gate.hold(500);
    let done = false;
    void gate.wait().then(() => {
      done = true;
    });
    clock.advance(1000);
    await settled();
    expect(done).toBe(true);
  });

  test('release ends every wait and the hold now', async () => {
    const gate = createAnimationGate(manualClock());
    gate.hold(2000);
    const waits = [gate.wait(), gate.wait()];
    gate.release();
    await Promise.all(waits);
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  test('a hold of nothing or less changes nothing', async () => {
    const gate = createAnimationGate(manualClock());
    gate.hold(0);
    gate.hold(-5);
    gate.hold(Number.NaN);
    await expect(gate.wait()).resolves.toBeUndefined();
  });
});

describe('the autopilot and the gate', () => {
  /** A client over the real host that counts the actions the autopilot sends. */
  function counting() {
    const host = new GameHost({ clock: () => 0 });
    const sent: Action[] = [];
    const client: GameClient = {
      newGame: (options: NewGameOptions) => host.newGame(options),
      act: async (action: Action): Promise<Snapshot> => {
        sent.push(action);
        return host.act(action);
      },
      undo: () => host.undo(),
    };
    return { client, sent };
  }
  const START = { seed: 1, humanDeck: 'synthetic-abilities', aiDeck: 'swamp-forest' } as const;

  test('each automatic pass waits on the gate first; a payment and a click do not', async () => {
    const { client, sent } = counting();
    let waits = 0;
    const gate: AnimationGate = {
      hold: () => {},
      wait: () => {
        waits += 1;
        return Promise.resolve();
      },
      release: () => {},
    };
    const store = createAppStore({ client, animationGate: gate });
    await store.getState().startGame(START);
    // Play on until the autopilot has passed for the player.
    for (let i = 0; i < 400 && store.getState().stats.autoPasses === 0; i += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.pending === null || view.result !== null) break;
      await store.getState().act(chooseAction(view, view.pending));
    }
    const { autoPasses, humanActions } = store.getState().stats;
    expect(autoPasses).toBeGreaterThan(0);
    // One wait for each automatic pass (the autopilot's own "no attack" counts too); the human's
    // explicit actions never waited.
    expect(waits).toBeGreaterThanOrEqual(autoPasses);
    expect(waits).toBeLessThanOrEqual(sent.length - humanActions);
  }, 60_000);

  test('a wait that never ends sends nothing, and a click of the player ends it', async () => {
    const { client, sent } = counting();
    let release = () => {};
    const gate: AnimationGate = {
      hold: () => {},
      wait: () => new Promise<void>((resolve) => (release = resolve)),
      release: () => release(),
    };
    const store = createAppStore({ client, animationGate: gate });
    await store.getState().startGame(START);
    let pending: Promise<void> | null = null;
    for (let i = 0; i < 400 && pending === null; i += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.pending === null || view.result !== null) break;
      const p = store.getState().act(chooseAction(view, view.pending));
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (store.getState().passing) pending = p;
      else await p;
    }
    expect(pending).not.toBeNull();
    // The autopilot is held at its pass: "Passing…" shows, and the pass has not been sent.
    const before = sent.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent.length).toBe(before);
    expect(store.getState().passing).toBe(true);
    // The player seizes priority: the wait ends and the autopilot stops before passing.
    store.getState().seize();
    await pending;
    expect(sent.length).toBe(before);
    expect(store.getState().passing).toBe(false);
  }, 60_000);

  test('without a gate the autopilot does not wait at all', async () => {
    const { client } = counting();
    const store = createAppStore({ client });
    await store.getState().startGame(START);
    expect(store.getState().screen).toBe('playing');
  });
});
