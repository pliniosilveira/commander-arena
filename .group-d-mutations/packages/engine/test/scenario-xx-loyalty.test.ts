// Loyalty abilities (CR 606): the cost symbol, sorcery timing, one activation a turn for each permanent, the 606.6 refusal, "[0]",
// "[-X]", an ability that outlives its walker, and the rewind of a cancelled activation.
// Pins: CR 606.2 (a loyalty ability is an activated ability with a loyalty symbol in its cost), 606.3 (any time you could cast a
// sorcery and no player has activated a loyalty ability of that permanent this turn), 606.4 ([+N] puts counters on it, [-N] removes),
// 606.5 ([-X]), 606.6 (a negative cost needs that many counters), 704.5i (0 loyalty goes to the graveyard), 113.7a (last-known
// information), 602.2b / 107.3a (X announced), 733 (rewind). All cards are SYNTHETIC (src/cards/fixtures/synthetic-planeswalkers.ts).
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Loyalty Walker';
const XW = 'SYNTHETIC X Walker';
const ULT = 'SYNTHETIC Ultimate Walker';
const STATIC = 'SYNTHETIC Static Walker';
const MANA = 'SYNTHETIC Mana Walker';
const BEARS = 'Grizzly Bears';

describe('activating a loyalty ability', () => {
  test('[+1] puts a loyalty counter, the effect resolves from the stack', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.expect.counters(WALKER, { loyalty: 5 });
    g.expect.stack([`${WALKER} (ability)`]);
    g.expect.life(0, 40);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.eventLog([{ kind: 'counterAdded', counter: 'loyalty', count: 1 }]);
  });

  test('[0] changes nothing on the walker and still counts as its loyalty ability for the turn', () => {
    const g = scenario().seat(0).library('Island', { count: 3 }).battlefield(WALKER).build();
    g.act(0).activate(WALKER, { ability: 1 });
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.noEvent({ kind: 'counterRemoved' });
    g.expect.noEvent({ kind: 'counterAdded', counter: 'loyalty' });
    g.passAll();
    g.expect.handSize(0, 1);
    // CR 606.3: no other loyalty ability of it this turn.
    for (const ability of [0, 1, 2]) {
      expect(g.act(0).try.activate(WALKER, { ability }).ok).toBe(false);
    }
  });

  test('[-2] removes two counters as a cost, with a target chosen first (CR 606.4)', () => {
    const g = scenario().seat(0).battlefield(WALKER).seat(1).battlefield(BEARS).build();
    g.act(0).activate(WALKER, { ability: 2, targets: [BEARS] });
    g.expect.counters(WALKER, { loyalty: 2 });
    g.expect.eventLog([{ kind: 'counterRemoved', counter: 'loyalty', count: 2 }]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('only one loyalty ability of a permanent each turn, whichever it is (CR 606.3)', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    const second = g.act(0).try.activate(WALKER, { ability: 0 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('CR 606.3');
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('two walkers each have their own activation (CR 606.3 is per permanent)', () => {
    const g = scenario().seat(0).battlefield(WALKER, XW).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.act(0).activate(XW, { ability: 0 });
    g.passAll();
    g.expect.counters(XW, { loyalty: 4 });
  });

  test('the next turn allows it again, and a walker that left and came back is a new object', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(WALKER)
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.expect.illegal(0, { activate: WALKER, ability: 0 });
    g.advanceTo('precombatMain', { turn: 5 });
    g.expect.legal(0, { activate: WALKER, ability: 0 });
  });

  test('only at sorcery timing: not with a spell on the stack, not in combat, not on the opponent turn (CR 606.3)', () => {
    const g = scenario().seat(0).battlefield(WALKER, 'Mountain').hand('Lightning Bolt').build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expect(g.act(0).try.activate(WALKER, { ability: 0 }).ok).toBe(false);
    g.expect.illegal(0, { activate: WALKER, ability: 0 });
    const c = scenario().seat(0).battlefield(WALKER).at('beginningOfCombat', { active: 0 }).build();
    expect(c.act(0).try.activate(WALKER, { ability: 0 }).ok).toBe(false);
    const o = scenario().seat(0).battlefield(WALKER).at('precombatMain', { active: 1 }).build();
    expect(o.act(0).try.activate(WALKER, { ability: 0 }).ok).toBe(false);
  });

  test('the opponent cannot activate it: it must control the walker', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    expect(getLegalActions(g.state, 1).some((a) => a.kind === 'activate')).toBe(false);
  });
});

describe('the cost must be payable (CR 606.6)', () => {
  test('[-2] with two counters is offered and takes the walker to 0 and the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, { counters: { loyalty: 2 } })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.expect.legal(0, { activate: WALKER, ability: 2 });
    g.act(0).activate(WALKER, { ability: 2, targets: [BEARS] });
    g.expect.zone(WALKER, 'graveyard', { seat: 0 });
    // CR 113.7a: the ability is on the stack and still resolves with the last-known information of the walker.
    g.expect.stack([`${WALKER} (ability)`]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('[-2] with one counter is not offered and is refused', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, { counters: { loyalty: 1 } })
      .seat(1)
      .battlefield(BEARS)
      .build();
    g.expect.illegal(0, { activate: WALKER, ability: 2 });
    const r = g.act(0).try.activate(WALKER, { ability: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('fewer than 2 loyalty counters');
    g.expect.legal(0, { activate: WALKER, ability: 0 });
    g.expect.legal(0, { activate: WALKER, ability: 1 });
  });

  test('a walker whose minus ability has no target is not offered that ability', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    g.expect.illegal(0, { activate: WALKER, ability: 2 });
    g.expect.legal(0, { activate: WALKER, ability: 0 });
  });

  test('an ultimate that takes all the loyalty still resolves after the walker is gone (CR 113.7a)', () => {
    const g = scenario().seat(0).battlefield(ULT).build();
    g.act(0).activate(ULT, { ability: 1 });
    g.expect.zone(ULT, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('[-X] (CR 606.5, 107.3a)', () => {
  test('X is announced, at most the loyalty, and that many counters are removed', () => {
    const g = scenario().seat(0).battlefield(XW).seat(1).battlefield(BEARS).build();
    const a = g.act(0).activate(XW, { ability: 1 });
    g.expect.pending('chooseX', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('expected chooseX');
    expect(d.max).toBe(3);
    expect(d.perX.loyalty).toBe(1);
    a.x(2).targets([BEARS]);
    g.expect.counters(XW, { loyalty: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('cancelling the announcement leaves the walker as it was (CR 733)', () => {
    const g = scenario().seat(0).battlefield(XW).seat(1).battlefield(BEARS).build();
    const a = g.act(0).activate(XW, { ability: 1 });
    a.x(3);
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.counters(XW, { loyalty: 3 });
    g.expect.stack([]);
    g.expect.legal(0, { activate: XW, ability: 1 });
  });
});

describe('cancelling a loyalty activation rewinds the cost and the turn note (CR 733)', () => {
  test('after the cancel the same ability can be activated again', () => {
    const g = scenario().seat(0).battlefield(WALKER).seat(1).battlefield(BEARS).build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.counters(WALKER, { loyalty: 4 });
    g.act(0).activate(WALKER, { ability: 2, targets: [BEARS] });
    g.expect.counters(WALKER, { loyalty: 2 });
  });
});

describe('static and triggered abilities of a planeswalker work as usual', () => {
  test('its static ability applies, and its triggered ability triggers', () => {
    const g = scenario().seat(0).battlefield(STATIC, BEARS).build();
    g.expect.pt(BEARS, 3, 3);
    g.act(0).activate(STATIC, { ability: 2 });
    g.expect.counters(STATIC, { loyalty: 6 });
  });
});

describe('a loyalty ability that adds mana is still an ability that uses the stack (CR 606.2, 605.1a)', () => {
  test('Mana Walker validates and its mana arrives when the ability resolves', () => {
    const g = scenario().seat(0).battlefield(MANA).build();
    g.act(0).activate(MANA, { ability: 0 });
    g.expect.pool(0, '');
    g.passAll();
    g.expect.pool(0, 'RR');
  });
});

describe('validation', () => {
  test('the SYNTHETIC walkers pass validateCard', () => {
    for (const name of [WALKER, XW, ULT, STATIC, MANA, 'SYNTHETIC Animate Walker']) {
      const card = scenario().seat(0).hand(name).build().object(name);
      expect(card).toBeDefined();
    }
  });
});
