// Turning a manifested permanent face up (CR 116.2b, 701.40b, 708.8, D-963): a special action any time its controller has priority, that does not use the
// stack; the card must be a creature card with a mana cost, and that cost is paid; the permanent is the same object afterwards with the card's own characteristics,
// what had been applied to it still applies, and nothing that has to do with entering the battlefield happens (CR 708.8). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-manifest.ts); the face-down permanents are placed with `faceDown: true`.
import { describe, expect, test } from 'vitest';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4 Beast
const VARIABLE = 'SYNTHETIC Manifest Variable'; // {X}{G} 2/2
const LAGGARD = 'SYNTHETIC Manifest Laggard'; // enters tapped, with a counter, gains 3 life when it enters
const LORD = 'SYNTHETIC Manifest Lord'; // {1}{W}{W} 2/2, other creatures you control get +1/+1
const WATCHER = 'SYNTHETIC Manifest Watcher'; // whenever another creature enters under your control, you gain 1 life
const FLIER = 'SYNTHETIC Manifest Flier'; // {1}{W} 1/3 flying
const COSTLESS = 'SYNTHETIC Manifest Costless'; // a creature card with no mana cost
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return theirs(
    mine(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', at)
    .build();
}

const forests = (b: Builder, count: number) => b.battlefield('Forest', { count });

describe('the special action is offered when it can be taken', () => {
  test('a manifested creature card whose cost its controller can pay', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    g.expect.legal(0, { turnFaceUp: BRUTE });
    expect(g.legalActions(0)).toContainEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
  });

  test('not when the cost cannot be paid', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 3).seat(0));
    g.expect.illegal(0, { turnFaceUp: BRUTE });
  });

  test('an {X} in the cost is 0 (CR 107.3): only the {G} is paid', () => {
    const g = game((b) => forests(b.seat(0).battlefield(VARIABLE, { faceDown: true }), 1).seat(0));
    g.expect.legal(0, { turnFaceUp: VARIABLE });
    g.act(0).turnFaceUp(VARIABLE, { pay: true });
    g.expect.pt(VARIABLE, 2, 2);
    g.expect.derived(VARIABLE, { subtypes: ['Elemental'], colors: ['G'] });
  });

  test('not a card that is not a creature card (CR 701.40b): a land, and an artifact that has a mana cost', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield('Mountain', { faceDown: true }), 4)
        .battlefield('Sol Ring', { faceDown: true })
        .seat(0),
    );
    g.expect.illegal(0, { turnFaceUp: 'Mountain' });
    g.expect.illegal(0, { turnFaceUp: 'Sol Ring' });
  });

  test('not a creature card that has no mana cost (CR 701.40b)', () => {
    const g = game((b) => forests(b.seat(0).battlefield(COSTLESS, { faceDown: true }), 4).seat(0));
    g.expect.illegal(0, { turnFaceUp: COSTLESS });
  });

  test('not a face-up permanent, and not by a player who does not control it', () => {
    const g = game(
      (b) => forests(b.seat(0).battlefield(BRUTE), 4).seat(0),
      (b) => forests(b.seat(1).battlefield(FLIER, { faceDown: true }), 4).seat(1),
    );
    g.expect.illegal(0, { turnFaceUp: BRUTE });
    g.expect.illegal(0, { turnFaceUp: FLIER });
  });

  test('with priority any time: with a spell on the stack, and in the other player turn', () => {
    const g = game(
      (b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
      (b) => b.seat(1).hand('Lightning Bolt').battlefield('Mountain'),
      { active: 1, turn: 4 },
    );
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.expect.stack(['Lightning Bolt']);
    g.pass(1);
    expect(g.deciding).toBe(0);
    g.expect.stack(['Lightning Bolt']);
    g.expect.legal(0, { turnFaceUp: BRUTE });
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    // The special action did not use the stack: the spell is still there and still to resolve.
    g.expect.stack(['Lightning Bolt']);
    g.expect.pt(BRUTE, 4, 4);
  });
});

describe('taking it (CR 701.40b, 116.1)', () => {
  test('the cost is paid and the permanent is the same object, face up, with the card characteristics', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    const id = g.id(BRUTE);
    g.expect.pt(BRUTE, 2, 2);
    g.act(0).turnFaceUp(BRUTE);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    expect(g.id(BRUTE)).toBe(id);
    expect(g.object(BRUTE).faceDown).toBeUndefined();
    g.expect.pt(BRUTE, 4, 4);
    g.expect.derived(BRUTE, { types: ['creature'], subtypes: ['Beast'], colors: ['G'] });
    g.expect.tapped('Forest[0]');
    g.expect.invariants();
  });

  test('it does not use the stack and the player keeps priority (CR 116.1)', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.step('precombatMain');
    expect(g.deciding).toBe(0);
  });

  test('the event says it, with the card, and nothing entered (CR 708.8)', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(LAGGARD, { faceDown: true }).battlefield(WATCHER), 4).seat(0),
    );
    const mark = g.mark();
    g.act(0).turnFaceUp(LAGGARD, { pay: true });
    const events = g.eventsSince(mark);
    expect(events.find((e) => e.kind === 'turnedFaceUp')).toMatchObject({
      kind: 'turnedFaceUp',
      seat: 0,
      object: g.id(LAGGARD),
      cost: ['2', 'G'],
    });
    expect(events.some((e) => e.kind === 'zoneChanged')).toBe(false);
    // Its enters abilities do not trigger and its enters replacements do not apply; nobody else's enters trigger sees a creature enter.
    g.expect.life(0, 20);
    g.expect.tapped(LAGGARD, false);
    g.expect.counters(LAGGARD, {});
    g.expect.pt(LAGGARD, 3, 3);
    g.expect.stack([]);
  });

  test('what was applied to it still applies, and counters, damage and tapped status stay (CR 708.8)', () => {
    const g = game((b) =>
      forests(
        b
          .seat(0)
          .battlefield(BRUTE, { faceDown: true, counters: { '+1/+1': 1 }, damage: 1, tapped: true })
          .battlefield(LORD),
        4,
      ).seat(0),
    );
    // Face down: 2/2 +1/+1 counter, +1/+1 from the lord.
    g.expect.pt(BRUTE, 4, 4);
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    // 4/4 with a counter and the lord.
    g.expect.pt(BRUTE, 6, 6);
    g.expect.counters(BRUTE, { '+1/+1': 1 });
    g.expect.damage(BRUTE, 1);
    g.expect.tapped(BRUTE, true);
  });

  test('a static ability of the card starts to work when it is face up', () => {
    const g = game((b) =>
      forests(b.seat(0).battlefield(LORD, { faceDown: true }).battlefield(FLIER), 2)
        .battlefield('Plains', { count: 3 })
        .seat(0),
    );
    g.expect.pt(FLIER, 1, 3);
    g.act(0).turnFaceUp(LORD, { pay: true });
    g.expect.pt(FLIER, 2, 4);
  });

  test('cancelling the payment changes nothing and gives priority back', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    const options = g.state.pending?.kind === 'priority' ? g.state.pending.options : [];
    g.act(0).turnFaceUp(BRUTE);
    g.act(0).cancel();
    g.expect.pending('priority', 0);
    expect(g.state.pending?.kind === 'priority' ? g.state.pending.options : null).toEqual(options);
    g.expect.tapped('Forest[0]', false);
    expect(g.object(BRUTE).faceDown).toBeDefined();
  });

  test('it can be taken in the other player turn when its controller has priority', () => {
    const g = game((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    g.advanceTo('upkeep', { turn: 'next' });
    // Seat 1 has priority first in its own upkeep; seat 0 gets it after seat 1 passes.
    g.pass(1);
    expect(g.deciding).toBe(0);
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.pt(BRUTE, 4, 4);
  });
});
