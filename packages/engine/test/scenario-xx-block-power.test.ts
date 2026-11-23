// "Creatures with power less than ~'s power can't block creatures you control." (issue 160, D-628)
// Pins: CR 509.1b (a creature can't block a creature it is barred from blocking: read as blockers are declared), CR 613.11 (a rules-modifying effect, read where the rule acts),
// CR 208.1 (power as it is now: with every effect and counter). Cards are SYNTHETIC (src/cards/fixtures/synthetic-block-power.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { attackedGame, canBlock } from './restriction-helpers';

const MARSHAL = 'SYNTHETIC Power Marshal'; // 3/3: creatures with power less than ~'s power can't block creatures you control
const BEARS = 'Grizzly Bears'; // 2/2
const GOBLIN = 'Raging Goblin'; // 1/1
const WALL = 'SYNTHETIC Brick Wall'; // 0/5 defender
const ANGEL = 'Serra Angel'; // 4/4 flying

describe('the card is valid', () => {
  test(MARSHAL, () => {
    expect(validateCard(syntheticCard(MARSHAL))).toEqual([]);
  });
});

describe('creatures with power less than the Marshal’s can’t block creatures you control (CR 509.1b)', () => {
  test('the creatures with less power cannot block any of my creatures; one with as much or more can', () => {
    const g = attackedGame([MARSHAL, BEARS], (b) =>
      b.battlefield(GOBLIN).battlefield(WALL).battlefield(ANGEL),
    );
    // Power 1 and 0 are less than 3: they can't block the Marshal or the Bears.
    expect(canBlock(g, GOBLIN, BEARS)).toBe(false);
    expect(canBlock(g, WALL, MARSHAL)).toBe(false);
    expect(canBlock(g, WALL, BEARS)).toBe(false);
    // Power 4 is not less than 3.
    expect(canBlock(g, ANGEL, BEARS)).toBe(true);
    expect(canBlock(g, ANGEL, MARSHAL)).toBe(true);
  });

  test('equal power is not less: a 3-power creature may block', () => {
    const g = attackedGame([MARSHAL], (b) => b.battlefield('SYNTHETIC Elf 3/3'));
    expect(canBlock(g, 'SYNTHETIC Elf 3/3', MARSHAL)).toBe(true);
  });

  test('without the Marshal the same creatures block as usual', () => {
    const g = attackedGame([BEARS], (b) => b.battlefield(GOBLIN).battlefield(WALL));
    expect(canBlock(g, GOBLIN, BEARS)).toBe(true);
    expect(canBlock(g, WALL, BEARS)).toBe(true);
  });

  test('the Marshal’s power as it is now: counters raise the bar, and the opponent’s creatures are not protected', () => {
    const g = attackedGame(
      [BEARS],
      (b) => b.battlefield(ANGEL),
      (b) => b.battlefield(MARSHAL, { counters: { '+1/+1': 2 } }),
    );
    // The Marshal is a 5/5: the Angel (power 4) can't block the Bears.
    expect(canBlock(g, ANGEL, BEARS)).toBe(false);
  });
});

describe('"~ can\'t be blocked by creatures with greater power" (CR 509.1b, 208.1)', () => {
  const SHY = 'SYNTHETIC Power Shy'; // 2/2

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(SHY))).toEqual([]);
  });

  test('a creature with greater power cannot block it; equal or less power can, and only it is protected', () => {
    const g = attackedGame([SHY, BEARS], (b) =>
      b.battlefield(GOBLIN).battlefield(WALL).battlefield(ANGEL),
    );
    expect(canBlock(g, ANGEL, SHY)).toBe(false);
    expect(canBlock(g, GOBLIN, SHY)).toBe(true);
    expect(canBlock(g, WALL, SHY)).toBe(true);
    // The other attacker has no such restriction.
    expect(canBlock(g, ANGEL, BEARS)).toBe(true);
  });

  test('equal power is not greater: a 2-power creature may block it', () => {
    const g = attackedGame([SHY], (b) => b.battlefield(BEARS));
    expect(canBlock(g, BEARS, SHY)).toBe(true);
  });

  test('its power as it is now: with a +1/+1 counter it is a 3/3, so a 3-power creature may block it but the Angel (4) may not', () => {
    const b = scenario().seat(0).library('Island', { count: 4 });
    b.battlefield(SHY, { counters: { '+1/+1': 1 } });
    b.seat(1).library('Island', { count: 4 });
    b.battlefield(ANGEL).battlefield('SYNTHETIC Elf 3/3');
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([SHY]);
    g.advanceTo('declareBlockers');
    expect(canBlock(g, 'SYNTHETIC Elf 3/3', SHY)).toBe(true);
    expect(canBlock(g, ANGEL, SHY)).toBe(false);
  });
});
