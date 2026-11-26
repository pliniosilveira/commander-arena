// Planeswalker Party deck (issue 132), group 19: Teyo, Geometric Tactician, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 508.1a (a restriction on whom may be attacked), CR 101.4 and 500.1 (turn order goes to the left: the nearest opponent on the left is the player whose turn comes next), CR 611.2a
// (until your next turn), CR 111.1 (the Wall token of its enters ability). Four seats, so left and right are different players.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const TEYO = real('Teyo, Geometric Tactician');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Teyo, Geometric Tactician', () => {
  const build = () =>
    scenario({ seats: 4 })
      .define(TEYO)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TEYO.name, { counters: { loyalty: 5 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'attacker' })
      .seat(2)
      .library(...LIBRARY)
      .seat(3)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  // After Teyo's -2, the creatures of seat 1 (in a four-seat game seat 2 is its nearest opponent to the left and seat 0 to the right) may attack only the one chosen and its planeswalkers.
  const declare = (direction: 'Left' | 'Right', target: 0 | 2 | 3) => {
    const g = build();
    g.act(0).activate(TEYO.name, { ability: 2 });
    g.passAll();
    g.act(0).chooseOption(direction);
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    return g.act(1).try.declareAttackers([{ attacker: 'attacker', target: { player: target } }]).ok;
  };

  test('left: seat 1 may attack seat 2 (the player whose turn comes next), not seat 3 or seat 0', () => {
    expect(declare('Left', 2)).toBe(true);
    expect(declare('Left', 3)).toBe(false);
    expect(declare('Left', 0)).toBe(false);
  });

  test('right: seat 1 may attack seat 0 (the player whose turn came before), not seat 2 or seat 3', () => {
    expect(declare('Right', 0)).toBe(true);
    expect(declare('Right', 2)).toBe(false);
    expect(declare('Right', 3)).toBe(false);
  });
});
