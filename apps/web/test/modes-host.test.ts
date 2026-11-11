/**
 * Modal spells and abilities (CR 700.2, D-114) through the game host with the hidden SYNTHETIC deck
 * `synthetic-modal`: the question, an illegal mode, the answer, the grouped target prompt, the
 * stack words, the log lines, a choice made for the player (one legal set), Cancel, a trigger that
 * cannot be cancelled and that the autopilot never answers it. Seeds are searched, not fixed.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { buildModel } from '../src/ui/decisions/model';
import { chosenModesLine } from '../src/ui/decisions/modes-picker';
import { initialUi } from '../src/ui/decisions/ui-state';
import { pressCancel } from './abilities-decks';
import { resolveStack } from './kicker-decks';
import { pressButton } from './mana-decks';
import {
  asksModes,
  canCastNamed,
  castNamed,
  modesOf,
  noCreatures,
  reachModal,
  reachModalStore,
  someCreature,
} from './modal-decks';

// The seed search plays whole games: give each test room.
vi.setConfig({ testTimeout: 90_000 });

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function must(accept: (view: GameView) => boolean) {
  const reached = await reachModal(accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

const THREE = 'SYNTHETIC Three Way Charm';
const TWIN = 'SYNTHETIC Twin Charm';
const withIllegalMode = (view: GameView) =>
  asksModes(THREE)(view) && (modesOf(view)?.modes.some((m) => !m.legal) ?? false);
const withCreature = (view: GameView) => asksModes(THREE)(view) && someCreature(view);

/** Answers the question with these modes, then pays with Auto-pay when asked. */
async function chooseModes(
  host: GameHost,
  snap: Snapshot,
  picks: readonly number[],
): Promise<Snapshot> {
  const next = await host.act(pressButton(snap.view, 'Confirm', (ui) => ({ ...ui, modes: picks })));
  expect(next.error).toBeNull();
  return next;
}

describe('"Choose one —" on a spell', () => {
  test('a mode with no legal target is in the decision as illegal, and only legal sets are offered', async () => {
    const { snap } = await must(withIllegalMode);
    const d = modesOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    expect(d.purpose).toBe('spell');
    expect(d.modes.map((m) => m.legal)).toEqual([false, true, true]);
    expect(d.sets).toEqual([[1], [2]]);
    // Nothing is picked, so Confirm sends nothing; picking the illegal mode changes nothing.
    const model = buildModel(snap.view, d, initialUi(d), {
      act: () => {},
      update: () => {},
      openChooser: () => {},
    });
    expect(model.bar.buttons[0]?.disabled).toBe(true);
    expect(pressCancel(snap.view)).toEqual({ kind: 'cancel' });
  });

  test('the answer is logged, the stack says what was chosen, and the mode runs', async () => {
    const { host, snap } = await must(withIllegalMode);
    const hand = snap.view.seats[snap.view.viewer]?.hand?.length ?? 0;
    const chosen = await chooseModes(host, snap, [1]);
    expect(texts(chosen)).toContain('You choose: Draw a card.');
    const paid = await host.act(pressButton(chosen.view, 'Auto-pay'));
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain(`You cast ${THREE}.`);
    const onStack = paid.view.stack.find((o) => o.name === THREE);
    expect(onStack?.modes).toEqual([1]);
    expect(chosenModesLine(onStack ?? {})).toBe('Chosen: Draw a card');
    const done = await resolveStack(host, paid);
    // The spell was out of the hand already when asked; the mode drew one card.
    expect(done.view.seats[done.view.viewer]?.hand?.length).toBe(hand + 1);
  });

  test('a mode with a target: the targets are asked under the mode, and the prompt says which', async () => {
    const { host, snap } = await must(withCreature);
    const d = modesOf(snap.view);
    expect(d?.sets).toEqual([[0], [1], [2]]);
    const chosen = await chooseModes(host, snap, [0]);
    const pending = chosen.view.pending;
    if (pending?.kind !== 'targets') throw new Error('expected the targets question');
    expect(pending.specs.map((s) => s.mode)).toEqual([0]);
    const model = buildModel(chosen.view, pending, initialUi(pending), {
      act: () => {},
      update: () => {},
      openChooser: () => {},
    });
    expect(model.bar.prompt).toBe(
      `Mode 1: Deals 3 damage to target creature. Choose a target for ${THREE}.`,
    );
    expect(model.bar.detail).toBe('0 of 1 chosen');
    // The spell is on the stack as it is cast, with its modes (D-114).
    const stacked = chosen.view.stack.find((o) => o.name === THREE);
    expect(chosenModesLine(stacked ?? {})).toBe('Chosen: Deals 3 damage to target creature');
    const target = pending.specs[0]?.legal[0];
    if (target === undefined) throw new Error('no legal target');
    const targeted = await host.act({ kind: 'chooseTargets', targets: [target] });
    expect(targeted.error).toBeNull();
  });

  test('Cancel at the question rewinds the cast: the card is back in the hand, no line is logged', async () => {
    const { host, snap } = await must(withIllegalMode);
    const hand = snap.view.seats[snap.view.viewer]?.hand?.length ?? 0;
    const back = await host.act(pressCancel(snap.view));
    expect(back.error).toBeNull();
    expect(back.view.pending?.kind).toBe('priority');
    // The card being cast is not in the hand while it is asked; it is back after Cancel.
    expect(back.view.seats[back.view.viewer]?.hand?.length).toBe(hand + 1);
    expect(texts(back).some((t) => t.startsWith('You choose'))).toBe(false);
    expect(back.view.stack.some((o) => o.name === THREE)).toBe(false);
  });
});

describe('a choice made for the player', () => {
  test('one legal set is chosen without a question, and the log says it was the only one', async () => {
    const { host, snap } = await must(canCastNamed(TWIN, noCreatures));
    const cast = await host.act(castNamed(snap.view, TWIN));
    expect(cast.error).toBeNull();
    // "Choose two" with the creature mode illegal: only modes 2 and 3 remain, one legal set.
    expect(cast.view.pending?.kind).not.toBe('chooseModes');
    expect(texts(cast)).toContain(
      'You choose: Target player gains 3 life and Draw a card (the only legal choice).',
    );
    const line = cast.log.find((l) => l.text.startsWith('You choose'));
    expect(line?.level).toBe('detail');
    const stacked = cast.view.stack.find((o) => o.name === TWIN);
    expect(stacked?.modes).toEqual([1, 2]);
  });

  test('with a creature to aim at, the same spell asks, and the three sets are offered', async () => {
    const { snap } = await must((v) => asksModes(TWIN)(v) && someCreature(v));
    expect(modesOf(snap.view)?.sets).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });
});

describe('a triggered ability that chooses a mode', () => {
  test('there is no Cancel, the engine refuses one, and the prompt words it as the ability', async () => {
    const { host, snap } = await must(asksModes('SYNTHETIC Modal Greeter', 'trigger'));
    const d = modesOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    expect(d.forTrigger).toBe(true);
    const model = buildModel(snap.view, d, initialUi(d), {
      act: () => {},
      update: () => {},
      openChooser: () => {},
    });
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.prompt).toBe("Choose one mode for SYNTHETIC Modal Greeter's ability.");
    const refused = await host.act({ kind: 'cancel' });
    expect(refused.error).not.toBeNull();
    const chosen = await chooseModes(host, snap, [0]);
    expect(texts(chosen)).toContain('You choose: You gain 3 life.');
  });
});

test('the autopilot never answers the question: it stays pending and the stop policy says stop', async () => {
  const store = await reachModalStore(asksModes(THREE));
  if (store === null) throw new Error('no seed reaches the situation');
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no view');
  expect(shouldStop(view, DEFAULT_STOPS)).toBe(true);
  expect(shouldStop(view, { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] })).toBe(true);
  // Give the autopilot time to act, if it were going to.
  await new Promise((done) => setTimeout(done, 50));
  expect(store.getState().passing).toBe(false);
  expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseModes');
  expect(store.getState().snapshot?.view.pending?.id).toBe(view.pending?.id);
});
