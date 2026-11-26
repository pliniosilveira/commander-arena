// Draconic Dissent deck (issue 167), Agitator Ant read from its real Oracle text and run by the engine at two and three seats.
// "At the beginning of your end step, each player may put two +1/+1 counters on a creature they control. Goad each creature that had counters put on it this way."
// Pins: CR 101.4 (each player in turn order, the active player first), CR 608.2d (a player who may do something chooses as it resolves), CR 608.2c ("this way" names what was really done),
// CR 701.15a (goad: attacks each combat if able, and a player other than the goader if able, until the goader's next turn).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const ANT = real('Agitator Ant');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** Counters of +1/+1 on the creature labelled `label`. */
function counters(g: ScenarioGame, label: string): number {
  return g.state.objects[g.id(label)]?.counters['+1/+1'] ?? 0;
}

/**
 * Seat 0 (the active player) has the Ant and the creature `p`; seat 1 has `a` and `e`; seat 2 has `d` (three seats). The end step is reached with the trigger on the stack.
 */
function board(
  seats: 2 | 3 = 3,
  mutate?: (b: ReturnType<typeof scenario>) => void,
  seatTwoCreature = true,
): ScenarioGame {
  const b = scenario({ seats }).define(ANT);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).battlefield(ANT.name, { label: 'ant' }).battlefield(BEARS, { label: 'p' });
  b.seat(1).battlefield(BEARS, { label: 'a' }).battlefield(BEARS, { label: 'e' });
  if (seats === 3) b.seat(2).battlefield(seatTwoCreature ? BEARS : 'Island', { label: 'd' });
  mutate?.(b);
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  g.advanceTo('end');
  g.passAll();
  return g;
}

/** Whether `seat` may declare no attackers on its next turn: false while a goaded creature of theirs must attack. */
function mayStayHome(g: ScenarioGame, seat: number): boolean {
  g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
  expect(g.state.turn.activeSeat).toBe(seat);
  try {
    g.act(seat).declareAttackers([]);
    return true;
  } catch {
    return false;
  }
}

describe('Agitator Ant', () => {
  test('asks each player in turn order, the active player first, before anything happens (CR 101.4)', () => {
    const g = board();
    expect(g.state.pending?.kind).toBeDefined();
    const order: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const seat = g.state.pending?.seat;
      if (seat === undefined) break;
      order.push(seat);
      g.act(seat).decline();
    }
    expect(order).toEqual([0, 1, 2]);
  });

  test('every player who accepts puts two counters on a creature they control, and only those creatures are goaded (CR 608.2c, 701.15a)', () => {
    const g = board();
    g.act(0).accept();
    g.act(1).accept();
    g.act(2).accept();
    g.act(0).choosePermanents('p');
    g.act(1).choosePermanents('a');
    g.act(2).choosePermanents('d');
    expect(counters(g, 'p')).toBe(2);
    expect(counters(g, 'a')).toBe(2);
    expect(counters(g, 'd')).toBe(2);
    expect(counters(g, 'e')).toBe(0);
    expect(counters(g, 'ant')).toBe(0);
    // Seat 1's `a` is goaded by seat 0 (the Ant's controller): it must attack, and not seat 0.
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).toThrow();
    expect(() => g.act(1).declareAttackers([{ attacker: 'a', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
    // Seat 2's `d` is goaded too, and may not attack seat 0 either.
    expect(mayStayHome(g, 2)).toBe(false);
  });

  test('a player who declines gets nothing and their creatures are not goaded', () => {
    const g = board();
    g.act(0).accept();
    g.act(1).decline();
    g.act(2).accept();
    g.act(0).choosePermanents('p');
    g.act(2).choosePermanents('d');
    expect(counters(g, 'a')).toBe(0);
    expect(counters(g, 'e')).toBe(0);
    expect(counters(g, 'p')).toBe(2);
    expect(counters(g, 'd')).toBe(2);
    // Seat 1 may stay home; seat 2's `d` may not.
    expect(mayStayHome(g, 1)).toBe(true);
    expect(mayStayHome(g, 2)).toBe(false);
  });

  test('the controller is not goaded by their own ability: their creature is goaded and must attack a player other than them, which is nobody (CR 701.15a)', () => {
    const g = board();
    g.act(0).accept();
    g.act(1).decline();
    g.act(2).decline();
    g.act(0).choosePermanents('p');
    expect(counters(g, 'p')).toBe(2);
    // `p` is goaded by its own controller: it attacks each combat if able, but never the goader, so it may attack another player.
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    g.act(1).declareAttackers([]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    g.act(2).declareAttackers([]);
  });

  test('a creature that already had counters but got none this time is not goaded (CR 608.2c)', () => {
    const g = board(3, (b) => {
      b.seat(1).battlefield(BEARS, { label: 'old', counters: { '+1/+1': 1 } });
    });
    g.act(0).decline();
    g.act(1).accept();
    g.act(2).decline();
    g.act(1).choosePermanents('a');
    expect(counters(g, 'old')).toBe(1);
    expect(counters(g, 'a')).toBe(2);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    // Only `a` has to attack: `old` and `e` may stay home.
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
  });

  test('a player with no creature who says yes puts the counters nowhere, and the others still do', () => {
    const g = board(3, undefined, false);
    g.act(0).accept();
    g.act(1).accept();
    g.act(2).accept();
    g.act(0).choosePermanents('p');
    g.act(1).choosePermanents('a');
    expect(counters(g, 'p')).toBe(2);
    expect(counters(g, 'a')).toBe(2);
    // The Island of seat 2 is no creature: it got nothing.
    expect(counters(g, 'd')).toBe(0);
  });

  test('at two seats the opponent is asked after the controller, and the creature they chose is goaded (CR 701.15a)', () => {
    const g = board(2);
    g.act(0).decline();
    g.act(1).accept();
    g.act(1).choosePermanents('e');
    expect(counters(g, 'e')).toBe(2);
    expect(counters(g, 'a')).toBe(0);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    // The only player other than the goader is the goaded creature's own controller: it is not a legal target, so `e` may attack seat 0 (CR 701.15a: only "if able").
    expect(() => g.act(1).declareAttackers([])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'e', target: { player: 0 } }]);
  });
});
