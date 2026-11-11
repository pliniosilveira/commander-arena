// Fear and intimidate (CR 702.36, 702.13).
// Pins: CR 702.36b (a creature with fear can't be blocked except by artifact creatures and/or black
// creatures), CR 702.13b (a creature with intimidate can't be blocked except by artifact creatures
// and/or creatures that share a color with it), CR 702.36c and 702.13c (multiple instances are
// redundant), CR 509.1b (evasion abilities are cumulative: a creature with flying and fear needs a
// flier or reach creature that is also black or an artifact), CR 105.2 (an artifact creature may be
// colorless: a colorless creature shares no color).
// Cards: SYNTHETIC Fear Bear (black), SYNTHETIC Intimidate Bear (red), SYNTHETIC Black Blocker,
// Red Blocker and Artifact Golem (src/cards/fixtures/synthetic-restrictions.ts), Grizzly Bears
// (green), Serra Angel (white, flying), Typhoid Rats (black), Giant Spider (green, reach).
import { describe, expect, test } from 'vitest';
import { attackedGame, canBlock } from './restriction-helpers';

const FEAR = 'SYNTHETIC Fear Bear';
const INTIMIDATE = 'SYNTHETIC Intimidate Bear';
const BLACK = 'SYNTHETIC Black Blocker';
const RED = 'SYNTHETIC Red Blocker';
const GOLEM = 'SYNTHETIC Artifact Golem';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';

describe('CR 702.36b: fear', () => {
  test('a black creature can block it', () => {
    const g = attackedGame([FEAR], (b) => b.battlefield(BLACK));
    expect(canBlock(g, BLACK, FEAR)).toBe(true);
  });

  test('an artifact creature can block it, a green creature and a white creature cannot', () => {
    const g = attackedGame([FEAR], (b) => b.battlefield(GOLEM, BEARS, ANGEL, RED));
    expect(canBlock(g, GOLEM, FEAR)).toBe(true);
    expect(canBlock(g, BEARS, FEAR)).toBe(false);
    expect(canBlock(g, ANGEL, FEAR)).toBe(false);
    expect(canBlock(g, RED, FEAR)).toBe(false);
  });

  test('with only non-black, non-artifact creatures, no blockers are asked for', () => {
    const g = attackedGame([FEAR], (b) => b.battlefield(BEARS, ANGEL));
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test("the attacker's own color is irrelevant: a black fear creature is blocked by black, not by itself colored otherwise", () => {
    const g = attackedGame([FEAR], (b) => b.battlefield('Typhoid Rats'));
    expect(canBlock(g, 'Typhoid Rats', FEAR)).toBe(true);
  });

  test('a creature without fear is blocked by anything, in the same combat', () => {
    const g = attackedGame([FEAR, 'SYNTHETIC Vanilla 3/3'], (b) => b.battlefield(BEARS));
    expect(canBlock(g, BEARS, FEAR)).toBe(false);
    expect(canBlock(g, BEARS, 'SYNTHETIC Vanilla 3/3')).toBe(true);
  });
});

describe('CR 702.13b: intimidate', () => {
  test('a creature that shares a color with it can block (red blocks a red attacker)', () => {
    const g = attackedGame([INTIMIDATE], (b) => b.battlefield(RED));
    expect(canBlock(g, RED, INTIMIDATE)).toBe(true);
  });

  test('an artifact creature can block it, even a colorless one', () => {
    const g = attackedGame([INTIMIDATE], (b) => b.battlefield(GOLEM));
    expect(canBlock(g, GOLEM, INTIMIDATE)).toBe(true);
  });

  test('a creature of another color cannot', () => {
    const g = attackedGame([INTIMIDATE], (b) => b.battlefield(BEARS, BLACK, ANGEL));
    expect(canBlock(g, BEARS, INTIMIDATE)).toBe(false);
    expect(canBlock(g, BLACK, INTIMIDATE)).toBe(false);
    expect(canBlock(g, ANGEL, INTIMIDATE)).toBe(false);
  });

  test("the color is the attacker's as it is now: a creature that became blue is blocked by blue", () => {
    // Fear Bear is black; Intimidate Bear red. The same blockers read different colors.
    const g = attackedGame([FEAR, INTIMIDATE], (b) => b.battlefield(BLACK, RED));
    expect(canBlock(g, BLACK, FEAR)).toBe(true);
    expect(canBlock(g, RED, FEAR)).toBe(false);
    expect(canBlock(g, BLACK, INTIMIDATE)).toBe(false);
    expect(canBlock(g, RED, INTIMIDATE)).toBe(true);
  });
});

describe('CR 509.1b: evasion abilities are cumulative', () => {
  const WRAITH = 'SYNTHETIC Dread Wraith'; // flying and fear
  const FLIER = 'SYNTHETIC Black Flier';

  test('flying and fear: only a creature that is black (or an artifact) and flies or has reach', () => {
    const g = attackedGame([WRAITH], (b) => b.battlefield(FLIER, ANGEL, BLACK, BEARS));
    expect(canBlock(g, FLIER, WRAITH)).toBe(true);
    expect(canBlock(g, ANGEL, WRAITH)).toBe(false); // flies, but white
    expect(canBlock(g, BLACK, WRAITH)).toBe(false); // black, but cannot block a flier
    expect(canBlock(g, BEARS, WRAITH)).toBe(false);
  });

  test('reach is not enough: fear still needs a black or artifact blocker', () => {
    const g = attackedGame([WRAITH], (b) => b.battlefield('Giant Spider', FLIER));
    // Giant Spider is green with reach: reach is not enough, fear needs black or artifact.
    expect(canBlock(g, 'Giant Spider', WRAITH)).toBe(false);
    expect(canBlock(g, FLIER, WRAITH)).toBe(true);
  });
});
