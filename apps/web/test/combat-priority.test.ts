/**
 * Priority between declaring blockers and combat damage (playtest issue 35). The engine gives the
 * defender priority after blocks (CR 509.2, 117.3d, 117.4); the page's autopilot must not pass it
 * away while the player has something to do. Games are played through the real host and store with
 * a human that blocks whenever it can.
 */
import type { Action, GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { GameClient, NewGameOptions, Snapshot } from '../src/game/protocol';
import { hasRelevantAction, type StopSettings } from '../src/policy/should-stop';
import { type AppStore, createAppStore } from '../src/store';
import { chooseAction } from './bot';

interface Played {
  /** What the human was asked right after each of its non-empty block declarations. */
  readonly afterBlocks: { step: string; active: number; kind: string }[];
  /** Passes the autopilot sent in a combat window where the human held a relevant action. */
  readonly passedAway: string[];
  /** Windows in the step where the human held a relevant action and was asked. */
  readonly asked: string[];
}

/** A client that tells the autopilot's passes (every call after the click that started them) apart. */
function watching(played: Played): { client: GameClient; click: () => void } {
  const host = new GameHost({ clock: () => 0 });
  let last: GameView | null = null;
  let calls = 0;
  const client: GameClient = {
    newGame: async (options: NewGameOptions) => {
      const started = await host.newGame(options);
      last = started.snapshot.view;
      return started;
    },
    act: async (action: Action): Promise<Snapshot> => {
      const before = last;
      const auto = calls > 0;
      calls += 1;
      const reply = await host.act(action);
      if (reply.error === null) last = reply.view;
      const pending = before?.pending;
      if (
        auto &&
        action.kind === 'pass' &&
        before !== null &&
        pending?.kind === 'priority' &&
        before.step === 'declareBlockers' &&
        (before.combat?.attackers.length ?? 0) > 0 &&
        before.stack.length === 0 &&
        hasRelevantAction(before, pending)
      ) {
        played.passedAway.push(`turn ${before.turn} ${before.step}`);
      }
      return reply;
    },
    undo: () => host.undo(),
  };
  return { client, click: () => (calls = 0) };
}

async function play(seed: number, settings: Partial<StopSettings>): Promise<Played> {
  const played: Played = { afterBlocks: [], passedAway: [], asked: [] };
  const { client, click } = watching(played);
  const store: AppStore = createAppStore({ client });
  store.getState().setSettings(settings);
  await store
    .getState()
    .startGame({ seed, humanDeck: 'synthetic-abilities', aiDeck: 'swamp-forest' });
  for (let i = 0; i < 3000; i += 1) {
    const view = store.getState().snapshot?.view;
    if (view === undefined || view.result !== null || view.pending === null) break;
    const pending = view.pending;
    if (
      pending.kind === 'priority' &&
      view.step === 'declareBlockers' &&
      view.stack.length === 0 &&
      hasRelevantAction(view, pending)
    ) {
      played.asked.push(`turn ${view.turn}`);
    }
    let action = chooseAction(view, pending);
    let blocked = false;
    if (pending.kind === 'declareBlockers') {
      const first = pending.candidates.find((c) => c.canBlock.length > 0);
      const attacker = first?.canBlock[0];
      if (first !== undefined && attacker !== undefined) {
        action = { kind: 'declareBlockers', blocks: [{ blocker: first.blocker, attacker }] };
        blocked = true;
      }
    }
    click();
    await store.getState().act(action);
    if (blocked) {
      const next = store.getState().snapshot?.view;
      played.afterBlocks.push({
        step: next?.step ?? '?',
        active: next?.activeSeat ?? -1,
        kind: next?.pending?.kind ?? 'none',
      });
    }
  }
  return played;
}

describe('the human is asked before combat damage once blockers are declared', () => {
  test('with Full Control the defender always has priority in the step', async () => {
    const seen: Played['afterBlocks'] = [];
    for (const seed of [1, 2]) seen.push(...(await play(seed, { fullControl: true })).afterBlocks);
    expect(seen.length).toBeGreaterThan(0);
    for (const w of seen) {
      expect(w).toEqual({ step: 'declareBlockers', active: 1, kind: 'priority' });
    }
  }, 60000);

  test('with the default stops the autopilot never passes that window away while an action exists', async () => {
    const passedAway: string[] = [];
    let asked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const played = await play(seed, {});
      passedAway.push(...played.passedAway);
      asked += played.asked.length;
    }
    // The player was asked in at least one such window, and none was passed for them.
    expect(asked).toBeGreaterThan(0);
    expect(passedAway).toEqual([]);
  }, 60000);
});
