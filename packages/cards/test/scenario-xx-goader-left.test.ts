// A goad whose goader left the game (issue 507, "more opponents"). CR 701.15a: "Until the next turn of the controller of that spell or ability, that creature is goaded."
// CR 800.4m: when a player leaves the game, an effect that lasts until that player's next turn "will last until that turn would have begun. They neither expire immediately
// nor last indefinitely." So the goaded creature is still forced to attack in the turns before the leaving player's turn would have come round, and free after it.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SLIVER = real('Taunting Sliver');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');
const LANDS = ['Plains', 'Swamp', 'Island', 'Mountain', 'Forest'];

/** `seats` seats; the goader (the active seat) casts Taunting Sliver on the Bears of `victim`. */
function goaded(seats: 3 | 4, goader: number, victim: number): ScenarioGame {
  const b = scenario({ seats }).define(SLIVER);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(goader).hand(SLIVER.name);
  for (const land of LANDS) b.seat(goader).battlefield(land);
  b.seat(victim).battlefield(BEARS, { label: 'c' });
  const g = b.at('precombatMain', { active: goader, turn: 3 }).build();
  g.act(goader).cast(SLIVER.name, { pay: true });
  g.passAll();
  if (g.state.pending?.kind === 'targets') g.act(goader).chooseTargets('c');
  g.passAll();
  return g;
}

/** Goes to the declare attackers step of the next turn (whoever's it is). */
function nextDeclare(g: ScenarioGame): void {
  g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
}

describe('Taunting Sliver: the goader leaves the game', () => {
  test('3 seats: still goaded until the goader turn would have begun, then free (CR 800.4m)', () => {
    const g = goaded(3, 0, 1);
    g.act(0).concede();
    // Seat 1's turn comes right after: the creature is still goaded and must attack.
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    // Seat 2's turn; then seat 0 (who left) would have had its turn: the goad ends as that turn would have begun.
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(2);
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).not.toThrow();
  });

  test('4 seats: a goader in the middle of the turn order leaves on its own turn', () => {
    const g = goaded(4, 1, 2);
    g.act(1).concede();
    // Turns 2, 3 and 0 still find the creature goaded (seat 2 is its controller); seat 1 would have been next.
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(2);
    expect(() => g.act(2).declareAttackers([])).toThrow();
    g.act(2).declareAttackers([{ attacker: 'c', target: { player: 3 } }]);
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(3);
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(0);
    // Seat 1 left, so its turn is skipped: the goad ends there, and seat 2 is free on its next turn.
    nextDeclare(g);
    expect(g.state.turn.activeSeat).toBe(2);
    expect(() => g.act(2).declareAttackers([])).not.toThrow();
  });
});
