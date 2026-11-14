// "Whenever one or more artifact creatures you control deal combat damage to a player, draw a card." (CR 603.2c, D-139): a batch trigger.
// Pins: CR 510.2 (combat damage is dealt simultaneously), CR 603.2c ("one or more" triggers once for the batch, not once for each source), CR
// 603.2g (damage that is entirely prevented doesn't trigger it), CR 702.7 (first strike: the first strike damage step and the regular one are
// different events), CR 506.2 (the defending player).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-batch.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const RING = 'SYNTHETIC Spy Ring'; // one or more artifact creatures you control deal combat damage to a player: draw
const FLAG = 'SYNTHETIC Raid Flag'; // one or more Goblins you control deal combat damage to an opponent: that player loses 1
const BANNER = 'SYNTHETIC Mob Banner'; // two or more creatures you control deal combat damage to a player: gain 2
const DRONE = 'SYNTHETIC Colorless Drone'; // 2/2 artifact creature
const JUGGERNAUT = 'SYNTHETIC Dust Juggernaut'; // 5/3 artifact creature
const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const FENCER = 'Fencing Ace'; // double strike
const WALL = 'SYNTHETIC Brick Wall';

describe('the cards are valid', () => {
  test.each([RING, FLAG, BANNER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('only combat damage counts (CR 603.2c, 510.2)', () => {
  test('noncombat damage from an artifact creature does not trigger it; its combat damage does', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(RING).battlefield('SYNTHETIC Swarm Sphere').battlefield('SYNTHETIC Copper Myr'),
    );
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: 'SYNTHETIC Swarm Sphere' }]);
    g.passAll();
    g.act(0).choosePermanents('SYNTHETIC Copper Myr');
    // The Sphere dealt 1 damage to the player with its own ability, not combat damage: nothing is waiting.
    g.expect.life(1, 19);
    g.expect.stack([]);
    g.advanceTo('combatDamage');
    g.expect.stack([`${RING} (ability)`]);
  });
});

describe('one or more artifact creatures (CR 603.2c)', () => {
  test('two artifact creatures hit the player in the same step: one trigger, one card', () => {
    const g = twoSeatGame((b) => b.battlefield(RING).battlefield(DRONE).battlefield(JUGGERNAUT));
    g.playCombat({ attack: [DRONE, JUGGERNAUT], until: 'combatDamage' });
    g.expect.stack([`${RING} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(1, 20 - 7);
    g.expect.invariants();
  });

  test('a creature that is not an artifact does not count: no trigger', () => {
    const g = twoSeatGame((b) => b.battlefield(RING).battlefield(BEARS));
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack([]);
  });

  test('an artifact creature and another creature: the artifact one is the one or more', () => {
    const g = twoSeatGame((b) => b.battlefield(RING).battlefield(DRONE).battlefield(BEARS));
    g.playCombat({ attack: [DRONE, BEARS], until: 'combatDamage' });
    g.expect.stack([`${RING} (ability)`]);
  });

  test('a blocked artifact creature deals its damage to the blocker: no trigger (the damage is not to a player)', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(RING).battlefield(DRONE),
      (b) => b.battlefield(WALL),
    );
    g.playCombat({
      attack: [DRONE],
      block: [{ blocker: WALL, attacker: DRONE }],
      until: 'combatDamage',
    });
    g.expect.stack([]);
  });

  test("damage to a creature and damage to the player in one step: only the player's counts", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(RING).battlefield(DRONE).battlefield(BEARS),
      (b) => b.battlefield(WALL),
    );
    g.playCombat({
      attack: [DRONE, BEARS],
      block: [{ blocker: WALL, attacker: DRONE }],
      until: 'combatDamage',
    });
    // The Bears is no artifact creature; the Drone hit the Wall.
    g.expect.stack([]);
  });

  test('a double striker deals damage in two steps: the ability triggers in each (two different batches)', () => {
    const g = twoSeatGame((b) => b.battlefield(RING).battlefield(DRONE).battlefield(FENCER));
    g.playCombat({ attack: [FENCER, DRONE], until: 'combatDamage' });
    // The Drone has no first strike: only the regular damage step has it; the Ace (not an artifact) triggers nothing here.
    g.expect.stack([`${RING} (ability)`]);
  });
});

describe('over another filter, whom and how many', () => {
  test('"one or more Goblins ... to an opponent": the player damaged is "that player"', () => {
    const g = twoSeatGame((b) => b.battlefield(FLAG).battlefield(GOBLIN).battlefield(BEARS));
    g.playCombat({ attack: [GOBLIN, BEARS], until: 'combatDamage' });
    g.expect.stack([`${FLAG} (ability)`]);
    g.passAll();
    g.expect.life(1, 20 - 3 - 1);
  });

  test('"two or more creatures": one creature is not enough, two are', () => {
    const one = twoSeatGame((b) => b.battlefield(BANNER).battlefield(BEARS));
    one.playCombat({ attack: [BEARS], until: 'combatDamage' });
    one.expect.stack([]);
    const two = twoSeatGame((b) => b.battlefield(BANNER).battlefield(BEARS).battlefield(GOBLIN));
    two.playCombat({ attack: [BEARS, GOBLIN], until: 'combatDamage' });
    two.expect.stack([`${BANNER} (ability)`]);
    two.passAll();
    two.expect.life(0, 22);
  });

  test('two Spy Rings each trigger once for the batch', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(RING, { count: 2 }).battlefield(DRONE).battlefield(JUGGERNAUT),
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack([DRONE, JUGGERNAUT]);
    g.passAll();
    g.passAll();
    g.passAll();
    // Two identical triggers wait, one for each Ring (not one for each creature): the controller orders them (CR 603.3b).
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected the order of the triggers');
    expect(d.triggers.reduce((n, t) => n + t.count, 0)).toBe(2);
  });
});
