// Draconic Dissent deck (issue 167), goad group: Spectacular Showdown read from its real Oracle text and run by the engine at three seats.
// "Put a double strike counter on target creature, then goad each creature that had a double strike counter put on it this way." and "Overload {4}{R}{R}{R}".
// Pins: CR 701.15a (goad), CR 122.1b (a double strike counter gives double strike), CR 608.2c ("this way" names what the instruction before it did), CR 702.96 (Overload: "target"
// becomes "each").
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SHOWDOWN = real('Spectacular Showdown');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');
const LANDS = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain'];

/** Seat 0 holds the Showdown with seven Mountains; seat 1 has `a` and `e`, seat 2 has `d`. */
function board(): ScenarioGame {
  const b = scenario({ seats: 3 }).define(SHOWDOWN);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0)
    .hand(SHOWDOWN.name)
    .battlefield(...LANDS);
  b.seat(1).battlefield(BEARS, { label: 'a' }).battlefield(BEARS, { label: 'e' });
  b.seat(2).battlefield(BEARS, { label: 'd' });
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

/** Whether `seat` may declare no attackers: false while a goaded creature of theirs must attack. */
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

describe('Spectacular Showdown', () => {
  test('the creature gets a double strike counter and is goaded (CR 122.1b, 701.15a)', () => {
    const g = board();
    g.act(0).cast(SHOWDOWN.name, { pay: true, targets: ['a'] });
    g.passAll();
    expect(g.state.objects[g.id('a')]?.counters['double strike']).toBe(1);
    expect(mayStayHome(g, 1)).toBe(false);
  });

  test('a creature that got no counter is not goaded (CR 608.2c)', () => {
    const g = board();
    g.act(0).cast(SHOWDOWN.name, { pay: true, targets: ['a'] });
    g.passAll();
    expect(g.state.objects[g.id('e')]?.counters['double strike']).toBeUndefined();
    // Only `a` must attack (it may not attack the goader); `e` and, a turn later, `d` are free to stay home.
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    g.act(1).declareAttackers([{ attacker: 'a', target: { player: 2 } }]);
    expect(mayStayHome(g, 2)).toBe(true);
  });

  test('overloaded: every creature of an opponent gets a counter and is goaded (CR 702.96a)', () => {
    const g = board();
    g.act(0).cast(SHOWDOWN.name, { alternative: 'overload', pay: true });
    g.passAll();
    for (const label of ['a', 'e', 'd']) {
      expect(g.state.objects[g.id(label)]?.counters['double strike'], label).toBe(1);
    }
  });
});
