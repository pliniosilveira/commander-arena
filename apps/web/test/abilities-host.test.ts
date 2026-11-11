/**
 * Activated abilities (D-075) through the game host with the hidden SYNTHETIC deck
 * `synthetic-abilities`: a pump, Cycling from the hand, a targeted ability, a sacrifice cost with
 * Cancel, what undo does for `activate`, and how the log and the stack panel read.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activatedStackIds } from '../src/game/activation';
import type { Snapshot } from '../src/game/protocol';
import { activateAction, canActivate, find, pressCancel, reachAbilities } from './abilities-decks';
import { pressButton } from './mana-decks';

const mine = (s: Snapshot) => s.view.activeSeat === s.view.viewer;
const texts = (s: Snapshot) => s.log.map((l) => l.text);
const stackTop = (view: GameView) => view.stack[view.stack.length - 1];

async function reach(accept: (s: Snapshot) => boolean) {
  const reached = await reachAbilities(accept);
  if (reached === null) throw new Error('no seed reached the situation');
  return reached;
}

/** Activates, then pays with Auto-pay as the page does by default, like a click on a card. */
async function activate(
  host: Awaited<ReturnType<typeof reach>>['host'],
  snap: Snapshot,
  name: string,
) {
  const action = activateAction(snap, name);
  if (action === null) throw new Error(`cannot activate ${name}`);
  const asked = await host.act(action);
  expect(asked.error).toBeNull();
  return asked;
}

describe('a pump from the battlefield', () => {
  const ready = (s: Snapshot) => mine(s) && canActivate(s, 'SYNTHETIC Pump Bear');

  test('activate, pay, and the ability resolves: the creature is bigger until end of turn', async () => {
    const { host, snap } = await reach(ready);
    const bear = find(snap.view, 'SYNTHETIC Pump Bear');
    expect(bear?.power).toBe(2);
    const asked = await activate(host, snap, 'SYNTHETIC Pump Bear');
    // The cost {1} goes through the payment flow every spell uses.
    expect(asked.view.pending?.kind).toBe('payMana');
    const paid = await host.act(pressButton(asked.view, 'Auto-pay'));
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain("You activate SYNTHETIC Pump Bear's ability.");
    const onStack = stackTop(paid.view);
    expect(onStack).toBeDefined();
    expect(onStack?.abilitySource).toBe(bear?.id);
    expect(onStack?.name).toBe('SYNTHETIC Pump Bear');
    // The log tells the stack panel this one was activated, not triggered.
    expect(onStack !== undefined && activatedStackIds(paid.log).has(onStack.id)).toBe(true);

    const resolved = await host.act({ kind: 'pass' });
    expect(resolved.error).toBeNull();
    const after = resolved.view.battlefield.find((o) => o.id === bear?.id);
    expect(after?.power).toBe(3);
    expect(after?.toughness).toBe(3);
  });

  test('a refused activation changes nothing and says why', async () => {
    const { host, snap } = await reach(ready);
    const next = await host.act({ kind: 'activate', object: 'o99999', abilityIndex: 0 });
    expect(next.error).not.toBeNull();
    expect(next.view.pending?.id).toBe(snap.view.pending?.id);
  });
});

describe('Cycling from the hand', () => {
  const ready = (s: Snapshot) => canActivate(s, 'SYNTHETIC Cycling Bear');

  test('the card is discarded for the cost, a card is drawn when the ability resolves, the log says "cycle"', async () => {
    const { host, snap } = await reach(ready);
    const card = find(snap.view, 'SYNTHETIC Cycling Bear');
    expect(card?.zone).toBe('hand');
    const handBefore = snap.view.seats[0]?.handCount ?? 0;
    const asked = await activate(host, snap, 'SYNTHETIC Cycling Bear');
    const paid = await host.act(pressButton(asked.view, 'Auto-pay'));
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain('You cycle SYNTHETIC Cycling Bear.');
    expect(texts(paid)).not.toContain("You activate SYNTHETIC Cycling Bear's ability.");
    expect(paid.view.seats[0]?.handCount).toBe(handBefore - 1);
    expect(paid.view.seats[0]?.graveyard.map((o) => o.name)).toContain('SYNTHETIC Cycling Bear');

    const resolved = await host.act({ kind: 'pass' });
    expect(resolved.error).toBeNull();
    expect(texts(resolved).some((t) => t.startsWith('You draw'))).toBe(true);
    expect(resolved.view.seats[0]?.handCount).toBe(handBefore);
  });

  test('a card with a cast option and Cycling offers both options at priority', async () => {
    const { snap } = await reach(
      (s) =>
        mine(s) &&
        canActivate(s, 'SYNTHETIC Cycling Bear') &&
        s.view.pending?.kind === 'priority' &&
        s.view.pending.options.some(
          (o) => o.kind === 'castSpell' && o.object === find(s.view, 'SYNTHETIC Cycling Bear')?.id,
        ),
    );
    const id = find(snap.view, 'SYNTHETIC Cycling Bear')?.id;
    const kinds =
      snap.view.pending?.kind === 'priority'
        ? snap.view.pending.options.flatMap((o) =>
            (o.kind === 'castSpell' || o.kind === 'activate') && o.object === id ? [o.kind] : [],
          )
        : [];
    expect(kinds).toEqual(['castSpell', 'activate']);
  });
});

describe('an ability with a target', () => {
  test('the target is chosen first, then the ability goes on the stack aimed at it', async () => {
    const { host, snap } = await reach(
      (s) =>
        mine(s) &&
        canActivate(s, 'SYNTHETIC Coach') &&
        s.view.battlefield.filter((o) => o.types.includes('creature')).length >= 2,
    );
    const asked = await activate(host, snap, 'SYNTHETIC Coach');
    const pending = asked.view.pending;
    if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
    const target = pending.specs[0]?.legal[0];
    if (target === undefined) throw new Error('no legal target');
    const chosen = await host.act({
      kind: 'chooseTargets',
      targets: [{ ...target, specId: pending.specs[0]?.specId ?? '' }],
    });
    expect(chosen.error).toBeNull();
    expect(stackTop(chosen.view)?.targets).toHaveLength(1);
    expect(texts(chosen)).toContain("You activate SYNTHETIC Coach's ability.");
  });
});

describe('a sacrifice as a cost, and Cancel', () => {
  const ready = (s: Snapshot) =>
    mine(s) &&
    canActivate(s, 'SYNTHETIC Altar') &&
    s.view.battlefield.filter((o) => o.types.includes('creature') && o.controller === 0).length >=
      2;

  test('the engine asks which creature, Cancel rewinds the activation, and nothing is lost', async () => {
    const { host, snap } = await reach(ready);
    const asked = await activate(host, snap, 'SYNTHETIC Altar');
    const pending = asked.view.pending;
    if (pending?.kind !== 'choosePermanent')
      throw new Error(`expected choosePermanent, got ${pending?.kind}`);
    expect(pending.forCost).toBe(true);
    expect(asked.undoDepth).toBeGreaterThan(0);

    // The model's Cancel button sends the action the engine lists for this decision.
    const cancel = pressCancel(asked.view);
    expect(cancel).toEqual({ kind: 'cancel' });
    const back = await host.act(cancel);
    expect(back.error).toBeNull();
    expect(back.view.pending?.kind).toBe('priority');
    expect(back.view.stack).toHaveLength(snap.view.stack.length);
    expect(back.view.battlefield.map((o) => o.id)).toEqual(snap.view.battlefield.map((o) => o.id));
    expect(back.view.seats[0]?.life).toBe(snap.view.seats[0]?.life);
    // Back where the activation began, as with a cancelled cast: nothing left to undo.
    expect(back.undoDepth).toBe(snap.undoDepth);
    // And it can be started again.
    expect(canActivate(back, 'SYNTHETIC Altar')).toBe(true);
  });

  test('sacrificing pays: the creature is gone and the ability gains 2 life', async () => {
    const { host, snap } = await reach(ready);
    const asked = await activate(host, snap, 'SYNTHETIC Altar');
    const pending = asked.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const victim = pending.legal[0];
    if (victim === undefined) throw new Error('nothing legal');
    const name = asked.view.battlefield.find((o) => o.id === victim)?.name;
    const paid = await host.act(
      pressButton(asked.view, 'Confirm', (ui) => ({ ...ui, permanents: [victim] })),
    );
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain(`You sacrifice ${name}.`);
    expect(texts(paid)).toContain("You activate SYNTHETIC Altar's ability.");
    const life = snap.view.seats[0]?.life ?? 0;
    const resolved = await host.act({ kind: 'pass' });
    expect(resolved.view.seats[0]?.life).toBe(life + 2);
  });
});

describe('undo and activate', () => {
  // `activate` is a priority-window action like `castSpell`: it is undoable, and cancelling it
  // returns to where it began (game/host.ts, UNDOABLE_ACTIONS).
  const ready = (s: Snapshot) => mine(s) && canActivate(s, 'SYNTHETIC Pump Bear');

  test('an activation and its payment can be taken back, one step at a time', async () => {
    const { host, snap } = await reach(ready);
    const base = snap.undoDepth;
    const asked = await activate(host, snap, 'SYNTHETIC Pump Bear');
    expect(asked.undoDepth).toBe(base + 1);
    const paid = await host.act(pressButton(asked.view, 'Auto-pay'));
    expect(paid.undoDepth).toBe(base + 2);
    expect(paid.view.stack.length).toBe(snap.view.stack.length + 1);

    const first = await host.undo();
    expect(first.view.pending?.kind).toBe('payMana');
    expect(first.view.stack.length).toBe(snap.view.stack.length + 1);
    const second = await host.undo();
    expect(second.view.pending?.kind).toBe('priority');
    expect(second.view.stack.length).toBe(snap.view.stack.length);
    expect(second.undoDepth).toBe(base);
    // The line about the activation went with it.
    expect(second.logReset?.map((l) => l.text)).not.toContain(
      "You activate SYNTHETIC Pump Bear's ability.",
    );
    // The mana is back: the same activation is on offer again.
    expect(canActivate(second, 'SYNTHETIC Pump Bear')).toBe(true);
  });

  test('cancelling at the payment drops the activation from the history', async () => {
    const { host, snap } = await reach(ready);
    const asked = await activate(host, snap, 'SYNTHETIC Pump Bear');
    const back = await host.act({ kind: 'cancel' });
    expect(back.error).toBeNull();
    expect(back.view.pending?.kind).toBe('priority');
    expect(back.undoDepth).toBe(snap.undoDepth);
    expect(asked.undoDepth).toBe(snap.undoDepth + 1);
  });

  test('once the ability resolves the history is cleared, as for a spell', async () => {
    const { host, snap } = await reach(ready);
    const asked = await activate(host, snap, 'SYNTHETIC Pump Bear');
    await host.act(pressButton(asked.view, 'Auto-pay'));
    const resolved = await host.act({ kind: 'pass' });
    expect(resolved.undoDepth).toBe(0);
  });

  test('the sacrifice that pays a cost clears the history: it answers a question, D-070', async () => {
    const { host, snap } = await reach(
      (s) =>
        mine(s) &&
        canActivate(s, 'SYNTHETIC Altar') &&
        s.view.battlefield.filter((o) => o.types.includes('creature') && o.controller === 0)
          .length >= 2,
    );
    const asked = await activate(host, snap, 'SYNTHETIC Altar');
    const pending = asked.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const paid = await host.act({ kind: 'choosePermanents', objects: pending.legal.slice(0, 1) });
    expect(paid.error).toBeNull();
    expect(paid.undoDepth).toBe(0);
  });
});
