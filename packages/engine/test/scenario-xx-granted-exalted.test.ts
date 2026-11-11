// "Clues you control have exalted" (D-149): a keyword that stands for a triggered ability, granted by a static ability.
// Pins: CR 613.1f (a keyword granted in layer 6 is an ability of the permanent, with what it stands for), CR 702.83a and 702.83b (Exalted: each
// instance triggers separately, so an object with two has two), CR 603.2 (the triggers of the permanents of the attacker's controller),
// CR 506.5 (attacks alone), CR 111.10f (a Clue is an artifact token). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-angels-statics.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MERCHANT = 'SYNTHETIC Truth Merchant';
const LORD = 'SYNTHETIC Exalted Lord';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([MERCHANT, LORD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Clues you control have exalted"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MERCHANT, 'Mountain')
      .battlefield(BEARS, { label: 'a' })
      .battlefield(BEARS, { label: 'b' })
      .battlefield(BEARS, { label: 'attacker' })
      .seat(1)
      .library(...LIBRARY)
      .hand('Lightning Bolt', 'Lightning Bolt', 'Murder')
      .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp')
      .build();

  test('with no Clue nothing is exalted', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('attacker');
    g.passAll();
    g.expect.pt('attacker', 2, 2);
  });

  test('a nontoken creature of mine dies: a Clue, which has exalted', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['a'], pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 1 });
    g.expect.derived('Clue', { keywords: ['exalted'] });
  });

  test('one Clue is one instance: the lone attacker gets +1/+1', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['a'], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('attacker');
    g.passAll();
    g.expect.pt('attacker', 3, 3);
  });

  test('two Clues are two instances: +2/+2', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['a'], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['b'], pay: true });
    g.passAll();
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('attacker');
    g.passAll();
    g.expect.pt('attacker', 4, 4);
  });

  test('attacking with two creatures is not "alone": no bonus', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['a'], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['attacker', 'b']);
    g.passAll();
    g.expect.pt('attacker', 2, 2);
  });

  test("the Clues are the Merchant's controller's: they stop when the Merchant leaves", () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: ['a'], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [MERCHANT], pay: true });
    g.passAll();
    g.expect.derived('Clue[0]', { keywords: [] });
    g.expect.derived('Clue[1]', { keywords: [] });
  });
});

describe('every instance counts: printed and granted exalted add up', () => {
  test('a creature with printed exalted and a Lord that gives it another: two instances on it, one on each other creature', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LORD, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    // The Lord: printed exalted and one granted by itself; the Bears: one granted. Three instances among permanents I control.
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 5, 5);
  });

  test("the opponent's creatures are not affected", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LORD)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });

  test('it stops when the Lord leaves: the Bears are no longer exalted', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LORD, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.expect.derived(BEARS, { keywords: ['exalted'] });
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [LORD], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: [] });
  });
});
