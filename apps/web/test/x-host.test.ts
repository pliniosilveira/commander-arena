/**
 * X in costs (CR 107.3a, 601.2b, D-103, D-107) through the game host with the hidden SYNTHETIC deck
 * `synthetic-x`: the question and its exact prompt, the answer, the total cost asked at the payment,
 * X on the stack and in the log, the damage, "pay X life", an activated ability, Cancel, and that the
 * autopilot never answers it. Seeds are searched, not fixed.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { pressCancel } from './abilities-decks';
import { pressButton } from './mana-decks';
import { asksX, chooseXOf, reachX, reachXStore } from './x-decks';

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function must(accept: (view: GameView) => boolean) {
  const reached = await reachX(accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

/** Answers X, then the targets with the opponent, then lets the autopilot's payment through. */
async function castWithX(host: GameHost, snap: Snapshot, x: number): Promise<Snapshot> {
  const chose = await host.act(pressButton(snap.view, `Choose X = ${x}`, (ui) => ({ ...ui, x })));
  expect(chose.error).toBeNull();
  let next = chose;
  if (next.view.pending?.kind === 'targets') {
    const legal = next.view.pending.specs.flatMap((s) => s.legal);
    const face = legal.find((t) => t.kind === 'player' && t.seat !== next.view.viewer);
    if (face === undefined) throw new Error('the opponent is not a legal target');
    next = await host.act({ kind: 'chooseTargets', targets: [face] });
    expect(next.error).toBeNull();
  }
  return next;
}

async function resolveTop(host: GameHost, from: Snapshot): Promise<Snapshot> {
  let snap = from;
  for (let i = 0; i < 6 && snap.view.stack.length > 0; i += 1) {
    snap = await host.act({ kind: 'pass' });
    expect(snap.error).toBeNull();
  }
  return snap;
}

describe('an {X}{R} burn spell', () => {
  test('the question names the card and the cost, the maximum is what the lands can pay, 0 to max are legal', async () => {
    const { snap } = await must(asksX('SYNTHETIC X Burn', 3));
    const d = chooseXOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    expect(d.purpose).toBe('spell');
    expect(d.perX).toEqual({ mana: 1, life: 0 });
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(3);
    const confirm = pressButton(snap.view, 'Choose X = 1');
    expect(confirm).toEqual({ kind: 'chooseX', value: 1 });
    expect(pressButton(snap.view, `Choose X = ${d.max}`, (ui) => ({ ...ui, x: d.max }))).toEqual({
      kind: 'chooseX',
      value: d.max,
    });
    expect(pressCancel(snap.view)).toEqual({ kind: 'cancel' });
  });

  test('X = 3: logged, on the stack as X = 3 with the cost paid, and the damage matches', async () => {
    const { host, snap } = await must(asksX('SYNTHETIC X Burn', 3));
    const before = snap.view.seats[1]?.life ?? 0;
    const targeted = await castWithX(host, snap, 3);
    const pay = targeted.view.pending;
    if (pay?.kind !== 'payMana') throw new Error('payment expected');
    // One {X}: X generic mana plus the {R}, locked in once X is known.
    expect(pay.totalCost).toEqual(['3', 'R']);
    const cast = await host.act({ kind: 'payAuto' });
    expect(cast.error).toBeNull();
    expect(texts(cast)).toContain('You cast SYNTHETIC X Burn with X = 3.');
    const spell = cast.view.stack.find((o) => o.name === 'SYNTHETIC X Burn');
    expect(spell?.x).toBe(3);
    const done = await resolveTop(host, cast);
    expect(done.view.seats[1]?.life).toBe(before - 3);
  });

  test('X = 0 is legal: logged as X = 0, no damage', async () => {
    const { host, snap } = await must(asksX('SYNTHETIC X Burn', 1));
    const before = snap.view.seats[1]?.life ?? 0;
    const targeted = await castWithX(host, snap, 0);
    const cast = await host.act({ kind: 'payAuto' });
    expect(targeted.error).toBeNull();
    expect(texts(cast)).toContain('You cast SYNTHETIC X Burn with X = 0.');
    const done = await resolveTop(host, cast);
    expect(done.view.seats[1]?.life).toBe(before);
  });

  test('more than the maximum is refused and the question stays', async () => {
    const { host, snap } = await must(asksX('SYNTHETIC X Burn', 1));
    const d = chooseXOf(snap.view);
    const bad = await host.act({ kind: 'chooseX', value: (d?.max ?? 0) + 1 });
    expect(bad.error).not.toBeNull();
    expect(chooseXOf(bad.view)?.id).toBe(d?.id);
  });

  test('Cancel rewinds the cast: the card is back in the hand and nothing is on the stack', async () => {
    const { host, snap } = await must(asksX('SYNTHETIC X Burn', 1));
    const inHand = (s: Snapshot) =>
      (s.view.seats[s.view.viewer]?.hand ?? []).filter((o) => o.name === 'SYNTHETIC X Burn').length;
    const handBefore = inHand(snap) + 1; // the card being cast has left the hand
    const cancelled = await host.act(pressCancel(snap.view));
    expect(cancelled.error).toBeNull();
    expect(cancelled.view.stack).toEqual([]);
    expect(inHand(cancelled)).toBe(handBefore);
    expect(cancelled.view.pending?.kind).toBe('priority');
    expect(texts(cancelled).some((t) => t.startsWith('You cast'))).toBe(false);
  });
});

test('"pay X life": each X costs 1 life, no mana for it, and the log and the life agree', async () => {
  const { host, snap } = await must(asksX('SYNTHETIC Blood Burn', 5));
  const d = chooseXOf(snap.view);
  expect(d?.perX).toEqual({ mana: 0, life: 1 });
  expect(d?.max).toBeGreaterThanOrEqual(5);
  const lifeBefore = snap.view.seats[snap.view.viewer]?.life ?? 0;
  const foeBefore = snap.view.seats[1]?.life ?? 0;
  const targeted = await castWithX(host, snap, 5);
  const pay = targeted.view.pending;
  if (pay?.kind !== 'payMana') throw new Error('payment expected');
  expect(pay.totalCost).toEqual(['R']);
  const cast = await host.act({ kind: 'payAuto' });
  expect(cast.error).toBeNull();
  expect(texts(cast)).toContain('You cast SYNTHETIC Blood Burn with X = 5.');
  expect(cast.view.seats[cast.view.viewer]?.life).toBe(lifeBefore - 5);
  expect(cast.view.stack.find((o) => o.name === 'SYNTHETIC Blood Burn')?.x).toBe(5);
  const done = await resolveTop(host, cast);
  expect(done.view.seats[1]?.life).toBe(foeBefore - 5);
});

test('an activated ability with two {X}: "Choose X for ...\'s ability.", logged, X on the ability', async () => {
  const { host, snap } = await must(asksX('SYNTHETIC Double Well', 1, 'ability'));
  const d = chooseXOf(snap.view);
  expect(d?.perX).toEqual({ mana: 2, life: 0 });
  const handBefore = snap.view.seats[snap.view.viewer]?.hand?.length ?? 0;
  const cast = await host.act(pressButton(snap.view, 'Choose X = 1', (ui) => ({ ...ui, x: 1 })));
  expect(cast.error).toBeNull();
  let next = cast;
  if (next.view.pending?.kind === 'payMana') next = await host.act({ kind: 'payAuto' });
  expect(texts(next)).toContain("You activate SYNTHETIC Double Well's ability with X = 1.");
  const ability = next.view.stack.find((o) => o.name === 'SYNTHETIC Double Well');
  expect(ability?.x).toBe(1);
  const done = await resolveTop(host, next);
  expect(done.view.seats[done.view.viewer]?.hand?.length).toBe(handBefore + 1);
});

test('the autopilot never answers the question: it stays pending and the stop policy says stop', async () => {
  const store = await reachXStore(asksX('SYNTHETIC X Burn', 1));
  if (store === null) throw new Error('no seed reaches the situation');
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no view');
  expect(shouldStop(view, DEFAULT_STOPS)).toBe(true);
  expect(shouldStop(view, { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] })).toBe(true);
  // Give the autopilot time to act, if it were going to.
  await new Promise((done) => setTimeout(done, 50));
  expect(store.getState().passing).toBe(false);
  expect(store.getState().snapshot?.view.pending?.kind).toBe('chooseX');
  expect(store.getState().snapshot?.view.pending?.id).toBe(view.pending?.id);
});
