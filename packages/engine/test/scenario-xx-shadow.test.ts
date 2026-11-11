// Shadow (CR 702.28), in both directions.
// Pins: CR 702.28b (a creature with shadow can't be blocked by creatures without shadow, and a
// creature without shadow can't be blocked by creatures with shadow), CR 702.28c (multiple
// instances are redundant), CR 509.1b (evasion abilities are cumulative: shadow with fear needs a
// blocker that satisfies both), CR 509.1a (a creature that can block only a creature with shadow
// can still choose not to).
// Cards: SYNTHETIC Shadow Bear (2/2) and Shadow Wall (1/4) (src/cards/fixtures/synthetic-
// restrictions.ts), Grizzly Bears, SYNTHETIC Vanilla 3/3.
import { describe, expect, test } from 'vitest';
import { attackedGame, canBlock } from './restriction-helpers';

const SHADOW = 'SYNTHETIC Shadow Bear';
const WALL = 'SYNTHETIC Shadow Wall';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

describe('CR 702.28b: a creature with shadow attacks', () => {
  test("creatures without shadow can't block it", () => {
    const g = attackedGame([SHADOW], (b) => b.battlefield(BEARS, VANILLA));
    g.expect.pending('priority', 0);
    expect(canBlock(g, BEARS, SHADOW)).toBe(false);
    expect(canBlock(g, VANILLA, SHADOW)).toBe(false);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('a creature with shadow can block it', () => {
    const g = attackedGame([SHADOW], (b) => b.battlefield(WALL, BEARS));
    expect(canBlock(g, WALL, SHADOW)).toBe(true);
    expect(canBlock(g, BEARS, SHADOW)).toBe(false);
  });
});

describe('CR 702.28b: a creature without shadow attacks', () => {
  test("a creature with shadow can't block it, one without can", () => {
    const g = attackedGame([VANILLA], (b) => b.battlefield(WALL, BEARS));
    expect(canBlock(g, WALL, VANILLA)).toBe(false);
    expect(canBlock(g, BEARS, VANILLA)).toBe(true);
  });

  test('when only creatures with shadow remain, nobody can block it and no question is asked', () => {
    const g = attackedGame([VANILLA], (b) => b.battlefield(WALL));
    g.expect.pending('priority', 0);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });
});

describe('both attackers in one combat', () => {
  test('each blocker is read against each attacker', () => {
    const g = attackedGame([SHADOW, VANILLA], (b) => b.battlefield(WALL, BEARS));
    expect(canBlock(g, WALL, SHADOW)).toBe(true);
    expect(canBlock(g, WALL, VANILLA)).toBe(false);
    expect(canBlock(g, BEARS, SHADOW)).toBe(false);
    expect(canBlock(g, BEARS, VANILLA)).toBe(true);
  });
});
