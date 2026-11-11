import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { chooseAction, playThrough } from './bot';

const options = { seed: 11, humanDeck: 'swamp-forest', aiDeck: 'white-knights' };
const makeStore = () => createAppStore({ client: new GameHost({ clock: () => 0 }) });

describe('the autopilot (A18)', () => {
  test('starting a game stops at the mulligan, the first real question', async () => {
    const store = makeStore();
    await store.getState().startGame(options);
    const s = store.getState();
    expect(s.screen).toBe('playing');
    expect(s.snapshot?.view.pending?.kind).toBe('mulligan');
  });

  test('a whole game: the player never clicks on the opponent turn except for real choices', async () => {
    const store = makeStore();
    await store.getState().startGame(options);
    const clicks = await playThrough(store, 3000);
    expect(store.getState().snapshot?.view.result).not.toBeNull();

    // Priority is only ever the player's click on their own stops, or in response to an opponent
    // object while holding an instant they can cast.
    const priority = clicks.filter((c) => c.kind === 'priority');
    for (const c of priority) {
      const ownStop =
        c.activeSeat === 0 && (c.step === 'precombatMain' || c.step === 'postcombatMain');
      const response = c.stackSize > 0;
      // Before combat damage with an action to take (issue 35), or something aimed at the player (issue 34).
      const combat = c.relevant && (c.step === 'declareBlockers' || c.step === 'declareAttackers');
      expect(ownStop || response || combat, JSON.stringify(c)).toBe(true);
    }
    // And the autopilot did the passing in between.
    expect(store.getState().stats.autoPasses).toBeGreaterThan(priority.length);
  });

  test('a human with only sorcery-speed cards is never asked anything on the opponent turn but blocks', async () => {
    const store = makeStore();
    await store
      .getState()
      .startGame({ ...options, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    const clicks = await playThrough(store, 3000);
    const oppTurn = clicks.filter((c) => c.activeSeat === 1 && c.kind === 'priority');
    // The knights deck holds Angel's Mercy (an instant): a response, an object aimed at the player or a combat window with an action.
    for (const c of oppTurn) {
      const combat = c.relevant && (c.step === 'declareBlockers' || c.step === 'declareAttackers');
      expect(c.stackSize > 0 || combat).toBe(true);
    }
  });

  test('seizing priority holds the autopilot before its next pass', async () => {
    const waiting: (() => void)[] = [];
    const store = createAppStore({
      client: new GameHost({ clock: () => 0 }),
      autoPassDelayMs: 1,
      sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
    });
    await store.getState().startGame(options);
    // Keeping the hand lets the autopilot start passing; it parks on its delay first.
    const acting = store.getState().act({ kind: 'keepHand' });
    while (waiting.length === 0) await new Promise((r) => setTimeout(r, 1));
    expect(store.getState().passing).toBe(true);
    const passesBefore = store.getState().stats.autoPasses;
    store.getState().seize();
    for (const release of waiting) release();
    await acting;
    expect(store.getState().passing).toBe(false);
    expect(store.getState().stats.autoPasses).toBe(passesBefore);
    expect(store.getState().snapshot?.view.pending?.kind).toBe('priority');
  });
});

test('a refused action keeps the old snapshot and reports the error', async () => {
  const store = makeStore();
  await store.getState().startGame(options);
  const before = store.getState().snapshot;
  await store.getState().act({ kind: 'declareBlockers', blocks: [] });
  expect(store.getState().snapshot).toBe(before);
  expect(store.getState().error).not.toBeNull();
});

describe('undo (D-050)', () => {
  async function toLandPlay() {
    const store = makeStore();
    await store.getState().startGame(options);
    await store.getState().act({ kind: 'keepHand' });
    for (let i = 0; i < 40; i++) {
      const d = store.getState().snapshot?.view.pending;
      if (d?.kind === 'priority' && d.options.some((o) => o.kind === 'playLand')) return store;
      if (d === null || d === undefined) break;
      await store.getState().act(chooseAction(store.getState().snapshot?.view as never, d));
    }
    throw new Error('no land play reached');
  }

  test('taking back a land restores the board and trims the log', async () => {
    const store = await toLandPlay();
    const before = store.getState().snapshot;
    const logBefore = store.getState().log.length;
    const d = before?.view.pending;
    if (d?.kind !== 'priority') throw new Error('expected priority');
    const land = d.options.find((o) => o.kind === 'playLand');
    if (land?.kind !== 'playLand') throw new Error('no land');
    await store.getState().act({ kind: 'playLand', object: land.object });
    expect(store.getState().snapshot?.undoDepth).toBe(1);
    expect(store.getState().log.length).toBeGreaterThan(logBefore);

    await store.getState().undo();
    expect(store.getState().snapshot?.view).toEqual(before?.view);
    expect(store.getState().log.length).toBe(logBefore);
    expect(store.getState().passing).toBe(false);
    // The autopilot did not pass for the player after the undo.
    expect(store.getState().snapshot?.view.pending?.kind).toBe('priority');
  });

  test('with nothing to undo the call is refused and nothing changes', async () => {
    const store = makeStore();
    await store.getState().startGame(options);
    const before = store.getState().snapshot;
    await store.getState().undo();
    expect(store.getState().snapshot).toBe(before);
    expect(store.getState().error).not.toBeNull();
  });
});

test('a click made while the autopilot is passing is not lost: it runs at the next safe point', async () => {
  const waiting: (() => void)[] = [];
  const store = createAppStore({
    client: new GameHost({ clock: () => 0 }),
    autoPassDelayMs: 1,
    sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
  });
  await store.getState().startGame(options);
  // Keeping the hand lets the autopilot start passing; it parks on its delay.
  const keeping = store.getState().act({ kind: 'keepHand' });
  while (waiting.length === 0) await new Promise((r) => setTimeout(r, 1));
  expect(store.getState().passing).toBe(true);

  // The player concedes while the autopilot is parked: the action must not be dropped.
  const conceding = store.getState().act({ kind: 'concede' });
  for (const release of waiting) release();
  await keeping;
  await conceding;
  expect(store.getState().snapshot?.view.result).not.toBeNull();
});
