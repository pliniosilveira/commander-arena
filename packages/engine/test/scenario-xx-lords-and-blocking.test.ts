// Static abilities that set base power and toughness and add a creature type to a group, and "[Type]s you control can't be blocked by [Type]s" (D-139).
// Pins: CR 613.1d (layer 4: types, "in addition to" keeps the others, CR 205.1b), CR 613.4b (layer 7b sets base power and toughness) and 613.4c
// (counters and +N/+N apply on top), CR 613.7 (timestamps: the permanent's own), CR 611.3a (a static ability is not locked in: creatures that
// come later are included, one that leaves takes the effect with it), CR 509.1b (a creature that can't be blocked by creatures with some
// quality: read as blockers are declared), CR 205.3m (creature types).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-statics-artifacts.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { attackedGame, canBlock } from './restriction-helpers';
import { twoSeatGame } from './two-seat-helpers';

const LORD = 'SYNTHETIC Juggernaut Lord'; // 7/5 Juggernaut; Juggernauts can't be blocked by Walls; others: base 5/3, Juggernauts
const ELF_BANNER = 'SYNTHETIC Elf Banner'; // 7/5 Elf; Elves can't be blocked by Goblins; others: base 1/1 and Elves
const GROUND = 'SYNTHETIC Ground Standard'; // 7/5 Bear; Bears can't be blocked by flyers; others: base 2/2 and Bears
const BRUTE = 'SYNTHETIC Bully Brute'; // 4/4 Ogre; can't be blocked by creatures with power 2 or less
const JUGGERNAUT = 'SYNTHETIC Dust Juggernaut'; // 5/3 artifact creature Juggernaut
const WALL = 'SYNTHETIC Brick Wall'; // 0/5 Wall, defender
const BEARS = 'Grizzly Bears'; // 2/2 Bear
const GOBLIN = 'Raging Goblin'; // 1/1 Goblin
const ANGEL = 'Serra Angel'; // 4/4 flying
const SPIDER = 'Giant Spider'; // 2/4 reach
const ELF = 'SYNTHETIC Elf 3/3';
const SHRINK = 'SYNTHETIC Shrink'; // -2/-2 until end of turn

describe('the cards are valid', () => {
  test.each([LORD, ELF_BANNER, GROUND, BRUTE, JUGGERNAUT, WALL])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types" (CR 613.4b, 613.1d)', () => {
  test("the other creatures you control are 5/3 Juggernauts and keep their types; the lord and the opponent's creatures are untouched", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(LORD).battlefield(BEARS, { label: 'mine' }).battlefield(GOBLIN),
      (b) => b.battlefield(BEARS, { label: 'theirs' }),
    );
    g.expect.pt(LORD, 7, 5);
    g.expect.pt('mine', 5, 3);
    g.expect.pt(GOBLIN, 5, 3);
    g.expect.derived('mine', { subtypes: ['Bear', 'Juggernaut'], types: ['creature'] });
    g.expect.derived(GOBLIN, { subtypes: ['Goblin', 'Berserker', 'Juggernaut'] });
    g.expect.pt('theirs', 2, 2);
    g.expect.derived('theirs', { subtypes: ['Bear'] });
    g.expect.invariants();
  });

  test('counters and +N/+N effects apply on top of the base (layer 7c after 7b)', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(LORD)
        .battlefield(BEARS, { counters: { '+1/+1': 2 } })
        .hand(SHRINK)
        .battlefield('Swamp'),
    );
    g.expect.pt(BEARS, 7, 5);
    g.act(0).cast(SHRINK, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 5, 3);
  });

  test('a creature that comes later is included (CR 611.3a: the effect is not locked in)', () => {
    const g = twoSeatGame((b) => b.battlefield(LORD).hand(GOBLIN).battlefield('Mountain'));
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pt(GOBLIN, 5, 3);
  });

  test('without the lord the creatures are as printed', () => {
    const g = twoSeatGame((b) => b.battlefield(BEARS).battlefield(GOBLIN));
    g.expect.pt(BEARS, 2, 2);
    g.expect.derived(BEARS, { subtypes: ['Bear'] });
  });

  test('the same shape over another type and numbers: "have base power and toughness 1/1 and are Elves"', () => {
    const g = twoSeatGame((b) => b.battlefield(ELF_BANNER).battlefield(ANGEL).battlefield(SPIDER));
    g.expect.pt(ANGEL, 1, 1);
    g.expect.derived(ANGEL, { subtypes: ['Angel', 'Elf'], keywords: ['flying', 'vigilance'] });
    g.expect.pt(SPIDER, 1, 1);
    g.expect.pt(ELF_BANNER, 7, 5);
  });

  test('another type again: Bears and 2/2', () => {
    const g = twoSeatGame((b) => b.battlefield(GROUND).battlefield(GOBLIN).battlefield(ELF));
    g.expect.pt(GOBLIN, 2, 2);
    g.expect.pt(ELF, 2, 2);
    g.expect.derived(ELF, { subtypes: ['Elf', 'Bear'] });
  });

  test('two lords: each one is "other" to the other, the later timestamp wins the base (CR 613.7)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(LORD).battlefield(GROUND, { fresh: true }).battlefield(BEARS),
    );
    // The later of the two sets base power and toughness last: Ground Standard entered later (a newer timestamp).
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(LORD, 2, 2);
    g.expect.pt(GROUND, 5, 3);
    g.expect.derived(BEARS, { subtypes: ['Bear', 'Juggernaut'] });
    g.expect.derived(LORD, { subtypes: ['Juggernaut', 'Bear'] });
  });
});

describe('"Juggernauts you control can\'t be blocked by Walls" (CR 509.1b)', () => {
  test('a Juggernaut cannot be blocked by a Wall, a Goblin can block it; a non-Juggernaut can be blocked by the Wall', () => {
    const g = attackedGame([LORD, JUGGERNAUT, BEARS], (b) =>
      b.battlefield(WALL).battlefield(GOBLIN).battlefield(ANGEL),
    );
    expect(canBlock(g, WALL, JUGGERNAUT)).toBe(false);
    expect(canBlock(g, WALL, LORD)).toBe(false);
    expect(canBlock(g, GOBLIN, JUGGERNAUT)).toBe(true);
  });

  test('a creature that became a Juggernaut by the same lord is covered too, and one that did not is not', () => {
    // The Bears is another creature, so it is a Juggernaut with the lord (it is not covered by the lord's own subject without it).
    const g = attackedGame([LORD, BEARS], (b) => b.battlefield(WALL));
    expect(canBlock(g, WALL, BEARS)).toBe(false);
    const plain = attackedGame([BEARS], (b) => b.battlefield(WALL));
    expect(canBlock(plain, WALL, BEARS)).toBe(true);
  });

  test("over another pair of types: Elves can't be blocked by Goblins, Walls block them", () => {
    const g = attackedGame([ELF_BANNER, ELF], (b) => b.battlefield(GOBLIN).battlefield(WALL));
    expect(canBlock(g, GOBLIN, ELF)).toBe(false);
    expect(canBlock(g, GOBLIN, ELF_BANNER)).toBe(false);
    expect(canBlock(g, WALL, ELF)).toBe(true);
  });

  test("a blocker filter on a keyword: Bears can't be blocked by creatures with flying, reach is not flying", () => {
    const g = attackedGame([GROUND, BEARS], (b) => b.battlefield(ANGEL).battlefield(SPIDER));
    expect(canBlock(g, ANGEL, BEARS)).toBe(false);
    expect(canBlock(g, SPIDER, BEARS)).toBe(true);
  });

  test('the subject is the creature itself and the filter compares power: only power 3 or more can block it', () => {
    const g = attackedGame([BRUTE], (b) =>
      b.battlefield(GOBLIN).battlefield(BEARS).battlefield(ELF),
    );
    expect(canBlock(g, GOBLIN, BRUTE)).toBe(false);
    expect(canBlock(g, BEARS, BRUTE)).toBe(false);
    expect(canBlock(g, ELF, BRUTE)).toBe(true);
  });

  test('with no legal blocker no blockers are asked for and the damage goes through', () => {
    const g = attackedGame([JUGGERNAUT, LORD], (b) => b.battlefield(WALL));
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40 - 12);
  });
});
