// "Each other opponent" with the real text of U.S.S. Prometheus, Prototype (issue 506, "more opponents"):
// "Whenever this deals combat damage to an opponent, it deals that much damage to each other opponent."
// The player the damage was dealt to stays "that opponent" and is not hit again; with two seats there is
// no other opponent at all.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const PROMETHEUS = real('U.S.S. Prometheus, Prototype');
const START_LIFE = 40;
// The printed power of U.S.S. Prometheus, Prototype (a spacecraft that is a 6/6 creature at 4+ charge counters).
const POWER = 6;

describe('U.S.S. Prometheus: damage to an opponent is repeated to each other opponent only', () => {
  test.each([
    [2, 1],
    [3, 1],
    [3, 2],
    [4, 1],
    [4, 3],
  ] as const)('with %i seats, attacking seat %i, nobody is hit twice', (seats, target) => {
    const b = scenario({ seats }).define(PROMETHEUS);
    for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library('Island', 'Island');
    b.seat(0).battlefield(PROMETHEUS.name, { label: 'p', counters: { charge: 8 } });
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'p', target: { player: target } }]);
    g.advanceTo('combatDamage', { block: false });
    g.passAll();
    const lives = Array.from({ length: seats }, (_, seat) => g.state.seats[seat]?.life ?? -1);
    // The attacked opponent takes the combat damage once; every other opponent takes that much once.
    for (let seat = 1; seat < seats; seat += 1) {
      expect(lives[seat], `seat ${seat}`).toBe(START_LIFE - POWER);
    }
    expect(lives[0]).toBe(START_LIFE);
  });
});
