// The damage spells of group 2 of the Feather deck (D-1313): "Target creature you control deals damage equal to its power to another target creature" (a bite whose second target must
// be a different object, `TargetSpec.differentFrom`) and "~ deals 4 damage to target creature you don't control and 2 damage to target creature you control" (two damage
// instructions of one spell, each to its own target).
// Pins: CR 120.3 (damage is dealt by the source; the creature that bites takes none), CR 115.3 (the same object can't be chosen for two targets that must differ), CR 608.2b (a
// spell with a target that is no longer legal does not do that part; a spell with every target illegal does not resolve), CR 601.2c (all targets chosen as the spell is cast).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-feather-g2.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HAMMER = 'SYNTHETIC Hammer Blow'; // {1}{R} instant: target creature you control deals damage equal to its power to another target creature
const TWIN = 'SYNTHETIC Twin Strike'; // {R} instant: 4 damage to target creature you don't control, 2 damage to target creature you control
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = ['Plains', 'Plains', 'Plains'] as const;

describe('the cards are valid', () => {
  test.each([HAMMER, TWIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Target creature you control deals damage equal to its power to another target creature"', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'mine' })
      .battlefield(BEARS, { label: 'mybears' })
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(HAMMER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .battlefield(ELVES, { label: 'elves' })
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature deals its power to the other target and takes nothing back (a bite, not a fight)', () => {
    const g = board();
    g.act(0).cast(HAMMER, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage('mine', 0);
    g.expect.invariants();
  });

  test('"another": the same creature cannot be chosen for both targets, a creature of the other player or of yours can (CR 115.3)', () => {
    const g = board();
    expect(() => g.act(0).cast(HAMMER, { targets: ['mine', 'mine'], pay: true })).toThrow();
    const h = board();
    h.act(0).cast(HAMMER, { targets: ['mybears', 'mine'], pay: true });
    h.passAll();
    // The Bears deal 2 to the Spider (2/4): it lives with 2 damage.
    h.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    h.expect.damage('mine', 2);
  });

  test('the first target must be a creature you control', () => {
    const g = board();
    expect(() => g.act(0).cast(HAMMER, { targets: ['theirs', 'mine'], pay: true })).toThrow();
  });

  test('the damage is the power of the creature: a 1/1 deals 1 (CR 120.3)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ELVES, { label: 'mine' })
      .battlefield('Mountain', 'Mountain')
      .hand(HAMMER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(HAMMER, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    // A 1/1 deals 1: the Bears survive.
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage('theirs', 1);
  });

  test('the creature that deals the damage is gone as the spell resolves: it deals no damage (CR 608.2b)', () => {
    const g = board();
    g.act(0).cast(HAMMER, { targets: ['mine', 'theirs'], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage('theirs', 0);
    g.expect.invariants();
  });

  test('the creature that is damaged is gone as the spell resolves: nothing is damaged, the creature takes nothing (CR 608.2b)', () => {
    const g = board();
    g.act(0).cast(HAMMER, { targets: ['mine', 'theirs'], pay: true });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage('mine', 0);
    g.expect.invariants();
  });
});

describe('"~ deals 4 damage to target creature you don\'t control and 2 damage to target creature you control"', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'mybears' })
      .battlefield(SPIDER, { label: 'myspider' })
      .battlefield('Mountain', 'Mountain')
      .hand(TWIN, BOLT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SPIDER, { label: 'theirs' })
      .battlefield(BEARS, { label: 'theirbears' })
      .at('precombatMain', { active: 0 })
      .build();

  test("each amount goes to its own target: 4 kills the opponent's 2/4, 2 kills my 2/2", () => {
    const g = board();
    g.act(0).cast(TWIN, { targets: ['theirs', 'mybears'], pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('2 damage to a creature of mine that has 4 toughness leaves it alive with 2 damage; 4 to the 2/2 kills it', () => {
    const g = board();
    g.act(0).cast(TWIN, { targets: ['theirbears', 'myspider'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.damage('myspider', 2);
  });

  test("the first target must be a creature you don't control and the second one you control", () => {
    const g = board();
    expect(() => g.act(0).cast(TWIN, { targets: ['mybears', 'theirs'], pay: true })).toThrow();
    const h = board();
    expect(() => h.act(0).cast(TWIN, { targets: ['theirs', 'theirbears'], pay: true })).toThrow();
  });

  test('one target gone as it resolves: the other still takes its damage (CR 608.2b)', () => {
    const g = board();
    g.act(0).cast(TWIN, { targets: ['theirbears', 'mybears'], pay: true });
    g.act(0).cast(BOLT, { targets: ['mybears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
