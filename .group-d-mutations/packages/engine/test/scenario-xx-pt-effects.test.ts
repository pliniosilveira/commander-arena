// Amounts in "until end of turn" power and toughness effects (D-109, D-115): "All creatures get -X/-X until
// end of turn", "Target creature gets +X/+0 until end of turn", "Creatures you control get +1/+1 until end
// of turn for each creature you control", "has base power and toughness each equal to the number of lands
// you control".
// Pins: CR 107.3a (X is announced as the spell is cast or the ability activated, and is the same in every
// part of it), CR 611.2c and 608.2h (what a resolving effect counts is determined once, when it is applied,
// and the objects it affects are fixed then: nothing that happens afterwards changes it), CR 613.4b and
// 613.4c (7b sets base values, 7c modifies), CR 704.5f (toughness 0 or less dies), CR 514.2 (until end of
// turn ends at cleanup). Cards are SYNTHETIC (src/cards/fixtures/synthetic-pt.ts).
import { describe, expect, test } from 'vitest';
import { stateHash } from '../src/index';
import { scenario } from '../src/testing/index';

const SURGE = 'SYNTHETIC Withering Surge';
const STRIKE = 'SYNTHETIC Surge Strike';
const RALLY = 'SYNTHETIC Mass Rally';
const SHAPE = 'SYNTHETIC Land Shape';
const RAGE = 'SYNTHETIC Rage Bear';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const SPIDER = 'Giant Spider'; // 2/4
const BOLT = 'Lightning Bolt';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

describe('"All creatures get -X/-X until end of turn"', () => {
  test('X = 2: every creature, whoever controls it, gets -2/-2, and those with toughness 2 or less die', () => {
    const g = scenario()
      .seat(0)
      .hand(SURGE)
      .battlefield('Swamp', 'Swamp', 'Swamp', BEARS, SPIDER)
      .seat(1)
      .battlefield(ELVES, VANILLA)
      .build();
    g.act(0).cast(SURGE, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.pt(SPIDER, 0, 2);
    // The effect is stored with what X came to, as a number: -2 and -2.
    expect(g.state.continuousEffects.map((e) => e.change)).toEqual([
      { kind: 'modifyPt', power: -2, toughness: -2 },
    ]);
    g.expect.invariants();
  });

  test('X = 3 kills the 3/3 too and leaves the 2/4 a -1/1', () => {
    const g = scenario()
      .seat(0)
      .hand(SURGE)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', SPIDER, BEARS)
      .seat(1)
      .battlefield(VANILLA)
      .build();
    g.act(0).cast(SURGE, { x: 3, pay: true });
    g.passAll();
    g.expect.pt(SPIDER, -1, 1);
    g.expect.zone(VANILLA, 'graveyard', { seat: 1 });
  });

  test('X = 0 changes nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(SURGE)
      .battlefield('Swamp', BEARS)
      .seat(1)
      .battlefield(ELVES)
      .build();
    g.act(0).cast(SURGE, { x: 0, pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(ELVES, 1, 1);
  });

  test('it ends at cleanup (CR 514.2) and a creature that entered after it was never affected (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(SURGE)
      .battlefield('Swamp', 'Swamp', SPIDER)
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.act(0).cast(SURGE, { x: 1, pay: true });
    g.passAll();
    g.expect.pt(SPIDER, 1, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(SPIDER, 2, 4);
    expect(g.state.continuousEffects).toEqual([]);
  });
});

describe('"Target creature gets +X/+0 until end of turn"', () => {
  test('X = 3 on a 2/2 makes it 5/2, and the combat damage is 5', () => {
    const g = scenario()
      .seat(0)
      .hand(STRIKE)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(STRIKE, { x: 3, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 5, 2);
    expect(g.state.continuousEffects.map((e) => e.change)).toEqual([
      { kind: 'modifyPt', power: 3, toughness: 0 },
    ]);
    g.playCombat({ attack: [BEARS], until: 'endOfCombat' });
    g.expect.life(1, 35);
  });

  test('each spell has its own X: +1/+0 and +2/+0 make 5/2', () => {
    const g = scenario()
      .seat(0)
      .hand(STRIKE, STRIKE)
      .battlefield('Mountain', { count: 5 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast({ name: STRIKE, zone: 'hand', nth: 0 }, { x: 1, targets: [BEARS], pay: true });
    g.act(0).cast({ name: STRIKE, zone: 'hand', nth: 0 }, { x: 2, targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 5, 2);
  });
});

describe('an activated ability with {X} in its cost', () => {
  test('{X}{R}: this creature gets +X/+0 until end of turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RAGE, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).activate(RAGE, { x: 2, pay: true });
    g.passAll();
    g.expect.pt(RAGE, 4, 2);
  });
});

describe('CR 611.2c, 608.2h: a count in a resolving effect is determined once', () => {
  test('Creatures you control get +1/+1 for each creature you control: counted as it resolves', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY)
      .battlefield('Plains', 'Plains', 'Plains', BEARS, ELVES, SPIDER)
      .seat(1)
      .battlefield(VANILLA)
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    // Three creatures of seat 0: each gets +3/+3. The opponent's creature gets nothing.
    g.expect.pt(BEARS, 5, 5);
    g.expect.pt(ELVES, 4, 4);
    g.expect.pt(SPIDER, 5, 7);
    g.expect.pt(VANILLA, 3, 3);
    expect(g.state.continuousEffects.map((e) => e.change)).toEqual([
      { kind: 'modifyPt', power: 3, toughness: 3 },
    ]);
  });

  test('a creature that dies afterwards does not shrink the bonus, and one that enters is not given it', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY, BOLT, 'SYNTHETIC Elf Scout')
      .battlefield('Plains', 'Plains', 'Plains', 'Mountain', 'Forest', BEARS, ELVES)
      .seat(1)
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast(BOLT, { targets: [ELVES], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast('SYNTHETIC Elf Scout', { pay: true });
    g.passAll();
    g.expect.pt('SYNTHETIC Elf Scout', 1, 1);
    g.expect.pt(BEARS, 4, 4);
  });

  test('the count is taken at resolution, after what was put on the stack above it (CR 608.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY, BOLT)
      .battlefield('Plains', 'Plains', 'Plains', 'Mountain', BEARS, ELVES)
      .seat(1)
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.act(0).cast(BOLT, { targets: [ELVES], pay: true });
    g.passAll();
    // The Elves died first: one creature is left, so +1/+1.
    g.expect.pt(BEARS, 3, 3);
  });

  test('base power and toughness each equal to a count (7b): counted once, whatever the lands do after', () => {
    const g = scenario()
      .seat(0)
      .hand(SHAPE, 'Forest')
      .battlefield('Forest', 'Forest', 'Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(SHAPE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    g.act(0).playLand({ name: 'Forest', zone: 'hand' });
    g.expect.pt(BEARS, 3, 3);
    expect(g.state.continuousEffects.map((e) => e.change)).toEqual([
      { kind: 'setPt', power: 3, toughness: 3 },
    ]);
  });
});

describe('determinism', () => {
  test('the same game twice gives the same hash', () => {
    const play = () => {
      const g = scenario()
        .seat(0)
        .hand(SURGE)
        .battlefield('Swamp', 'Swamp', 'Swamp', BEARS, SPIDER)
        .seat(1)
        .battlefield(ELVES)
        .build();
      g.act(0).cast(SURGE, { x: 2, pay: true });
      g.passAll();
      return stateHash(g.state);
    };
    expect(play()).toBe(play());
  });
});
