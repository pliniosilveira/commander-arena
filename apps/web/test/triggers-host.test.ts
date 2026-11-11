/**
 * Triggered abilities, sacrifice and tokens through the game host and the store, with the
 * SYNTHETIC trigger deck (test/trigger-decks.ts): the questions reach the human, the autopilot
 * leaves them alone, undo treats them as documented, the log reads well.
 */
import type { Action, GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { engineOrder, moveTrigger } from '../src/ui/decisions/order';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { chooseAction, playThrough } from './bot';
import { reachOnHost, reachTriggerDecision, startTriggerGame, triggerStore } from './trigger-decks';

/** The action a model button sends, so a test can drive the host the way a click would. */
function pressPrimary(view: GameView, mutate: (ui: UiState) => UiState = (ui) => ui): Action {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  const sent: Action[] = [];
  const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
  const model = buildModel(view, pending, mutate(initialUi(pending)), ctl);
  model.bar.buttons.find((b) => b.variant === 'primary')?.run();
  const action = sent[0];
  if (action === undefined) throw new Error('the primary button sent nothing');
  return action;
}

describe('the autopilot leaves the three questions to the player', () => {
  for (const kind of ['choosePermanent', 'orderTriggers', 'confirmOptional'] as const) {
    test(`${kind}: the game waits, nothing is sent for the player`, async () => {
      const reached = await reachTriggerDecision(kind);
      expect(reached).not.toBeNull();
      if (reached === null) return;
      const { store } = reached;
      const state = store.getState();
      expect(state.passing).toBe(false);
      expect(state.snapshot?.view.pending?.kind).toBe(kind);
      expect(state.snapshot?.view.decidingSeat).toBe(0);
      // Time passes: still the same question.
      await new Promise((r) => setTimeout(r, 20));
      expect(store.getState().snapshot?.view.pending?.kind).toBe(kind);
      expect(store.getState().snapshot?.revision).toBe(state.snapshot?.revision);
    });
  }

  test('Full Control or manual mana do not change that, and answering moves the game on', async () => {
    const reached = await reachTriggerDecision('confirmOptional');
    if (reached === null) throw new Error('no seed');
    const { store } = reached;
    store.getState().setSettings({ fullControl: true });
    store.getState().setManualPay(true);
    const before = store.getState().snapshot?.view.pending?.id;
    await store.getState().act({ kind: 'acceptOptional' });
    expect(store.getState().error).toBeNull();
    expect(store.getState().snapshot?.view.pending?.id).not.toBe(before);
  });
});

test('whole games with the trigger deck run to the end through the store without a stuck click', async () => {
  for (const seed of [1, 2, 3]) {
    const store = triggerStore();
    await startTriggerGame(store, seed);
    const clicks = await playThrough(store, 4000);
    const kinds = new Set(clicks.map((c) => c.kind));
    expect(kinds.has('confirmOptional') || kinds.has('choosePermanent')).toBe(true);
    expect(store.getState().error).toBeNull();
    expect(store.getState().snapshot?.aiFallbacks).toBe(0);
  }
}, 60_000);

describe('answering the questions through the models', () => {
  test('choosePermanent: pick a permanent, Confirm sacrifices exactly it', async () => {
    const reached = await reachOnHost('choosePermanent');
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const pick = pending.legal[pending.legal.length - 1];
    if (pick === undefined) throw new Error('nothing legal');
    const action = pressPrimary(snap.view, (ui) => ({ ...ui, permanents: [pick] }));
    expect(action).toEqual({ kind: 'choosePermanents', objects: [pick] });
    const before = snap.view.battlefield.find((o) => o.id === pick);
    const next = await host.act(action);
    expect(next.error).toBeNull();
    expect(next.log.map((l) => l.text)).toContain(`You sacrifice ${before?.name}.`);
    expect(next.view.battlefield.some((o) => o.id === pick)).toBe(false);
  });

  test('confirmOptional: Yes and No are both legal answers and read in the log', async () => {
    const yes = await reachOnHost('confirmOptional');
    const no = await reachOnHost('confirmOptional');
    if (yes === null || no === null) throw new Error('no seed');
    const pending = yes.snap.view.pending;
    if (pending?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const accepted = await yes.host.act(pressPrimary(yes.snap.view));
    expect(accepted.error).toBeNull();
    expect(accepted.log.map((l) => l.text)).toContain(
      `You choose to use ${pending.sourceName}'s ability.`,
    );
    const declined = await no.host.act({ kind: 'declineOptional' });
    expect(declined.error).toBeNull();
    expect(declined.log.map((l) => l.text)).toContain(
      `You choose not to use ${pending.sourceName}'s ability.`,
    );
  });

  test('orderTriggers: the first row of the list resolves first, the last one resolves last', async () => {
    for (const swap of [false, true]) {
      const reached = await reachOnHost('orderTriggers');
      if (reached === null) throw new Error('no seed');
      const { host, snap } = reached;
      const pending = snap.view.pending;
      if (pending?.kind !== 'orderTriggers') throw new Error('wrong decision');
      // The list as the panel shows it, optionally with the first row moved down.
      const shown = swap
        ? moveTrigger(initialUi(pending).triggerOrder, 0, 1)
        : initialUi(pending).triggerOrder;
      const action = pressPrimary(snap.view, (ui) => ({ ...ui, triggerOrder: shown }));
      expect(action).toEqual({ kind: 'orderTriggers', order: engineOrder(shown) });
      const next = await host.act(action);
      expect(next.error).toBeNull();
      // The top of the stack (the last entry) resolves first: it is the first row of the list.
      const top = next.view.stack[next.view.stack.length - 1];
      const bottom = next.view.stack[0];
      const first = pending.triggers[shown[0] ?? -1];
      const last = pending.triggers[shown[shown.length - 1] ?? -1];
      expect(top?.name).toBe(first?.sourceName);
      expect(bottom?.name).toBe(last?.sourceName);
      expect(top?.abilitySource).toBe(first?.source);
      // The log says each ability triggered, in the order they went on the stack.
      const triggered = next.log.filter((l) => l.text.endsWith(' triggers.')).map((l) => l.text);
      expect(triggered).toEqual(
        [...shown].reverse().map((i) => `${pending.triggers[i]?.sourceName} triggers.`),
      );
    }
  });
});

describe('undo and the three answers (D-050)', () => {
  test('answering choosePermanent, acceptOptional or declineOptional clears the history', async () => {
    const choose = await reachOnHost('choosePermanent');
    const optional = await reachOnHost('confirmOptional');
    if (choose === null || optional === null) throw new Error('no seed');
    const asked = choose.snap.view.pending;
    if (asked === null) throw new Error('nothing pending');
    const sacrificed = await choose.host.act(chooseAction(choose.snap.view, asked));
    expect(sacrificed.error).toBeNull();
    expect(sacrificed.undoDepth).toBe(0);
    expect((await choose.host.undo()).error).toBe('Nothing to undo.');

    const accepted = await optional.host.act({ kind: 'acceptOptional' });
    expect(accepted.undoDepth).toBe(0);
    expect((await optional.host.undo()).error).toBe('Nothing to undo.');
  });

  test('orderTriggers can be taken back: the same question comes back and the log is rewound', async () => {
    // Undoable only when the human still has the move after answering (no AI step followed).
    const reached = await reachOnHost('orderTriggers', {
      seeds: 200,
      // The human is the active player: the AI does not act after the answer.
      accept: (s) => s.view.activeSeat === 0,
    });
    if (reached === null) throw new Error('no seed');
    const { host, snap } = reached;
    const pending = snap.view.pending;
    if (pending?.kind !== 'orderTriggers') throw new Error('wrong decision');
    const answered = await host.act({
      kind: 'orderTriggers',
      order: pending.triggers.map((_, i) => i),
    });
    expect(answered.error).toBeNull();
    expect(answered.steps).toHaveLength(1);
    expect(answered.undoDepth).toBe(1);

    const undone = await host.undo();
    expect(undone.error).toBeNull();
    expect(undone.view.pending).toEqual(snap.view.pending);
    expect(undone.undoDepth).toBe(0);
    const rewound = new Set(undone.logReset?.map((l) => l.id));
    expect(answered.log.length).toBeGreaterThan(0);
    for (const line of answered.log) expect(rewound.has(line.id)).toBe(false);

    // And it can be answered again, differently.
    const flipped = await host.act({
      kind: 'orderTriggers',
      order: pending.triggers.map((_, i) => i).reverse(),
    });
    expect(flipped.error).toBeNull();
  });
});

describe('the game log', () => {
  /** Every line of several scripted games with the trigger deck. */
  async function logLines(seeds: readonly number[]): Promise<string[]> {
    const lines: string[] = [];
    for (const seed of seeds) {
      const store = triggerStore();
      await startTriggerGame(store, seed);
      await playThrough(store, 1500);
      lines.push(...store.getState().log.map((l) => l.text));
    }
    return lines;
  }

  test('sacrifices, tokens, triggers and choices read as plain English', async () => {
    const lines = await logLines([1, 2, 3, 4]);
    const has = (re: RegExp) => lines.some((l) => re.test(l));
    expect(has(/^You sacrifice .+\.$/)).toBe(true);
    expect(has(/^(You|Opponent) creates? an? .+ token\.$/)).toBe(true);
    expect(has(/^.+ triggers\.$/)).toBe(true);
    expect(has(/^.+'s ability resolves\.$/)).toBe(true);
    expect(has(/^You choose to use .+\.$/)).toBe(true);
    expect(has(/^You choose .+ to sacrifice for .+'s ability\.$/)).toBe(true);
    // An ability is always named after its source; none shows up as "a card".
    expect(lines.filter((l) => /\ba card\b/.test(l) && !/draws? a card/.test(l))).toEqual([]);
    expect(lines.filter((l) => /^'s ability/.test(l))).toEqual([]);
  }, 60_000);

  test('a Treasure that is sacrificed is named, even after it has ceased to exist', async () => {
    const lines = await logLines([1, 2, 3, 4]);
    expect(lines).toContain('You create a Treasure token.');
    expect(lines.some((l) => l === 'You sacrifice Treasure.')).toBe(true);
  }, 60_000);
});
