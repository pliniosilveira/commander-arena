// "This creature can't be blocked except by creatures with flying." (Silhana Ledgewalker): the static `cantBeBlockedBy` of the creatures that do not have flying.
// Pins: CR 509.1b (a blocking restriction is read as the blockers are declared), CR 702.9b (flying: reach is not flying), CR 702.17b.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { attackedGame, canBlock } from './restriction-helpers';

const SNEAK = 'SYNTHETIC Skyward Sneak';
const SPIDER = 'SYNTHETIC Reach Spider';
const FLIER = 'SYNTHETIC Flier 1/1';
const BEARS = 'Grizzly Bears';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SNEAK))).toEqual([]);
});

describe('"can\'t be blocked except by creatures with flying" (CR 509.1b)', () => {
  test('a creature with flying can block it', () => {
    const g = attackedGame([SNEAK], (b) => {
      b.battlefield(FLIER);
    });
    expect(canBlock(g, FLIER, SNEAK)).toBe(true);
  });

  test('a creature without flying can not', () => {
    const g = attackedGame([SNEAK], (b) => {
      b.battlefield(BEARS);
    });
    expect(canBlock(g, BEARS, SNEAK)).toBe(false);
  });

  test('reach is not flying', () => {
    const g = attackedGame([SNEAK], (b) => {
      b.battlefield(SPIDER);
    });
    expect(canBlock(g, SPIDER, SNEAK)).toBe(false);
  });

  test('it limits only the creature that has it', () => {
    const g = attackedGame([SNEAK, BEARS], (b) => {
      b.battlefield(SPIDER);
    });
    expect(canBlock(g, SPIDER, BEARS)).toBe(true);
    expect(canBlock(g, SPIDER, SNEAK)).toBe(false);
  });
});
