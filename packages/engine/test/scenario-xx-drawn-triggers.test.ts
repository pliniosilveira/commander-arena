// "Whenever you draw a card" and its relatives (D-111): the `drawn` trigger kind.
// Pins: CR 121.1 (to draw a card is to put the top card of the library into the hand), CR 121.2
// (draws happen one at a time), CR 121.4 (drawing from an empty library draws nothing), CR 504.1
// (the draw step's turn-based draw is a draw), CR 903.9b (a commander put into the command zone
// instead is not drawn, D-097), CR 603.2c (one trigger for each draw), CR 603.3 (triggers wait for
// priority). "Your second card each turn" counts the draws of the turn per player.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const CANTRIP = 'SYNTHETIC Cantrip';
const DRAW_WATCHER = 'SYNTHETIC Draw Watcher';
const RIVAL_WATCHER = 'SYNTHETIC Opponent Draw Watcher';
const ANY_WATCHER = 'SYNTHETIC Any Draw Watcher';
const SECOND_WATCHER = 'SYNTHETIC Second Draw Watcher';
const RIVAL_SECOND_WATCHER = 'SYNTHETIC Opponent Second Draw Watcher';

/** Seat 0 holds `watchers`, `cantrips` Cantrips and the Islands to cast them; seat 1 holds some too. */
function game(watchers: readonly string[], cantrips = 1, rivalCantrips = 0) {
  const b = scenario()
    .seat(0)
    .life(20)
    .battlefield(...watchers)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 });
  for (let i = 0; i < cantrips; i += 1) b.seat(0).hand(CANTRIP).battlefield('Island');
  for (let i = 0; i < rivalCantrips; i += 1) b.seat(1).hand(CANTRIP).battlefield('Island');
  return b.build();
}

type G = ReturnType<typeof game>;

/** The seat casts a Cantrip from its hand and it resolves; what it triggered waits on the stack. */
function cantrip(g: G, seat: 0 | 1 = 0): void {
  g.act(seat).cast({ name: CANTRIP, zone: 'hand', seat, nth: 0 }, { pay: true });
  g.pass();
  g.pass();
}

/** Resolves everything on the stack. */
const resolveAll = (g: G): void => {
  g.passAll();
};

describe('whenever you draw a card (CR 121.1)', () => {
  test('triggers when a spell makes you draw, after the draw, and goes on the stack', () => {
    const g = game([DRAW_WATCHER]);
    cantrip(g);
    g.expect.handSize(0, 1);
    g.expect.stack([`${DRAW_WATCHER} (ability)`]);
    g.expect.eventLog([
      { kind: 'cardDrawn', seat: 0 },
      { kind: 'abilityTriggered', seat: 0 },
    ]);
    resolveAll(g);
    g.expect.life(0, 21);
  });

  test('does not trigger for a draw by the opponent', () => {
    const g = game([DRAW_WATCHER], 0, 1);
    g.pass(); // seat 0 passes; seat 1 gets priority
    cantrip(g, 1);
    g.expect.handSize(1, 1);
    g.expect.stack([]);
    g.expect.life(0, 20);
  });

  test('"an opponent draws" triggers on their draw only, "you draw" on yours only', () => {
    const g = game([RIVAL_WATCHER, DRAW_WATCHER], 1, 1);
    cantrip(g);
    g.expect.stack([`${DRAW_WATCHER} (ability)`]);
    resolveAll(g);
    g.expect.life(0, 21);
    g.pass(); // seat 1 gets priority
    cantrip(g, 1);
    g.expect.stack([`${RIVAL_WATCHER} (ability)`]);
    resolveAll(g);
    g.expect.life(0, 22);
  });

  test('"a player draws" triggers on both players draws', () => {
    const g = game([ANY_WATCHER], 1, 1);
    cantrip(g);
    resolveAll(g);
    g.pass();
    cantrip(g, 1);
    resolveAll(g);
    g.expect.life(0, 22);
  });

  test('a spell that draws three cards triggers once for each card (CR 121.2, 603.2c)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRAW_WATCHER)
      .hand('SYNTHETIC Draw Three Gain Five')
      .pool('UUU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Draw Three Gain Five', { pay: true });
    g.pass();
    g.pass();
    g.expect.handSize(0, 3);
    expect(g.state.stack).toHaveLength(3);
  });

  test('drawing from an empty library draws no card and triggers nothing (CR 121.4)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRAW_WATCHER)
      .hand(CANTRIP)
      .pool('U')
      .seat(1)
      .build();
    g.act(0).cast(CANTRIP, { pay: true });
    g.pass();
    g.pass();
    g.expect.noEvent({ kind: 'cardDrawn' });
    g.expect.stack([]);
  });
});

describe('the draw step (CR 504.1, 504.2)', () => {
  test('the turn-based draw is a draw: the watcher triggers in the draw step', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRAW_WATCHER)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    g.advanceTo('draw', { turn: 'next' });
    g.expect.handSize(0, 1);
    g.expect.stack([`${DRAW_WATCHER} (ability)`]);
  });

  test('a commander put into the command zone instead of the hand was not drawn (CR 903.9b, D-097)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRAW_WATCHER)
      .library('Isamaru, Hound of Konda', { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'cardDrawn' });
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(0);
  });

  test('a commander drawn after all (the owner declines) is a card drawn', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DRAW_WATCHER)
      .library('Isamaru, Hound of Konda', { commander: true })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).declineCommandZone();
    g.expect.stack([`${DRAW_WATCHER} (ability)`]);
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(1);
  });
});

describe('your second card each turn (nth)', () => {
  test('the first draw does not trigger, the second does, the third does not', () => {
    const g = game([SECOND_WATCHER], 3);
    cantrip(g);
    g.expect.stack([]);
    cantrip(g);
    g.expect.stack([`${SECOND_WATCHER} (ability)`]);
    resolveAll(g);
    g.expect.life(0, 21);
    cantrip(g);
    g.expect.stack([]);
    g.expect.life(0, 21);
  });

  test('a spell that draws three triggers once, on the second card', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SECOND_WATCHER)
      .hand('SYNTHETIC Draw Three Gain Five')
      .pool('UUU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Draw Three Gain Five', { pay: true });
    g.pass();
    g.pass();
    expect(g.state.stack).toHaveLength(1);
  });

  test('the draw step counts: its card, then a spell, makes the second card of the turn', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SECOND_WATCHER, 'Island')
      .hand(CANTRIP)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('endOfCombat', { active: 1, turn: 2 })
      .build();
    g.advanceTo('draw', { turn: 'next' });
    g.expect.stack([]);
    g.advanceTo('precombatMain');
    g.expect.stack([]);
    cantrip(g);
    g.expect.stack([`${SECOND_WATCHER} (ability)`]);
  });

  test('the count starts over each turn, for every player', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SECOND_WATCHER, 'Island')
      .hand(CANTRIP)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    cantrip(g);
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(1);
    g.advanceTo('draw', { turn: 'next' });
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(0);
    expect(g.state.seats[1]?.cardsDrawnThisTurn).toBe(1);
    g.advanceTo('draw', { turn: 'next' });
    // Seat 0's draw step of its next turn is its first card again: the watcher does not trigger.
    g.expect.stack([]);
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(1);
  });

  test("an opponent's second card each turn is counted for them, not for you", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(RIVAL_SECOND_WATCHER)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(CANTRIP, CANTRIP)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    cantrip(g as G, 1);
    g.expect.stack([]);
    cantrip(g as G, 1);
    g.expect.stack([`${RIVAL_SECOND_WATCHER} (ability)`]);
  });

  test('a card replaced into the command zone does not count toward the second', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SECOND_WATCHER, 'Island', 'Island')
      .hand(CANTRIP, CANTRIP)
      .library('Isamaru, Hound of Konda', { commander: true })
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast({ name: CANTRIP, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.pass();
    g.pass();
    g.act(0).sendToCommandZone();
    g.expect.stack([]);
    // This draw is the first card drawn this turn, so it does not trigger "your second card".
    cantrip(g as G);
    g.expect.stack([]);
    expect(g.state.seats[0]?.cardsDrawnThisTurn).toBe(1);
  });
});

describe('determinism and legal actions', () => {
  test('the same draws give the same hash', () => {
    const run = () => {
      const g = game([SECOND_WATCHER, DRAW_WATCHER], 2);
      cantrip(g);
      cantrip(g);
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('every legal action at the trigger is accepted by the engine', () => {
    const build = () => {
      const g = game([SECOND_WATCHER], 2);
      cantrip(g);
      cantrip(g);
      return g;
    };
    for (const action of build().legalActions(0)) {
      const probe = build();
      expect(probe.act(0).try.action(action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});
