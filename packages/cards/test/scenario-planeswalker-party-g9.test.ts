// Planeswalker Party deck (issue 132), group 9: Chandra, Awakened Inferno, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 114.1-114.5 (each opponent gets an emblem that works from the command zone: at the beginning of its owner's upkeep it deals 1 damage to them), CR 120.2 (-3 deals 3 damage
// to each non-Elemental creature), CR 614.1a and 614.6 (a permanent dealt damage by -X is exiled if it would die this turn, whatever kills it), CR 615.6 (prevented damage is not dealt).
// Three seats, so "each opponent" is two emblems.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const CHANDRA = real('Chandra, Awakened Inferno');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

describe('Chandra, Awakened Inferno', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(CHANDRA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CHANDRA.name, { counters: { loyalty: 6 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('-X: a creature dealt lethal damage is exiled instead of dying', () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 3, x: 2, targets: ['bear'] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.counters(CHANDRA.name, { loyalty: 4 });
  });

  test('-X with less damage than toughness leaves the creature alive, marked for the turn', () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 3, x: 1, targets: ['bear'] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage('bear', 1);
  });

  test('+2: each opponent gets an emblem; at the beginning of their upkeep it deals them 1 damage', () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 1 });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(2, 40);
    g.expect.life(0, 40);
  });

  test("-3: 3 damage to each non-Elemental creature, the opponents' and the controller's", () => {
    const g = build();
    g.act(0).activate(CHANDRA.name, { ability: 2 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });
});
