// "{T}: Add {U}. If you played a land this turn, add {B} instead." (River of Tears): a mana ability whose `instead` production depends on the
// `playedLandThisTurn` condition. Pins: CR 305.1 (playing a land is a special action, so only the player's own land play counts), CR 305.2 (land plays
// are counted per turn), CR 605.3b (the mana ability reads the game as it is activated), CR 608.2c (an instruction that depends on the game as it resolves).
// The land is SYNTHETIC (src/cards/fixtures/synthetic-mana-instead.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FLAT = 'SYNTHETIC Tidal Flat';

describe('the card is valid', () => {
  test(FLAT, () => {
    expect(validateCard(syntheticCard(FLAT))).toEqual([]);
  });
});

describe('"If you played a land this turn, add {B} instead"', () => {
  test('with no land played this turn it makes {U}', () => {
    const g = scenario().seat(0).battlefield(FLAT).build();
    g.act(0).tapForMana(FLAT);
    g.expect.pool(0, 'U');
  });

  test('after the controller plays a land it makes {B}', () => {
    const g = scenario().seat(0).hand('Forest').battlefield(FLAT).build();
    g.act(0).playLand('Forest');
    g.act(0).tapForMana(FLAT);
    g.expect.pool(0, 'B');
  });

  test('a land that came to the battlefield without being played does not count', () => {
    const g = scenario().seat(0).battlefield(FLAT, 'Forest').build();
    g.act(0).tapForMana(FLAT);
    g.expect.pool(0, 'U');
  });

  test('the count starts again each turn: a land played in an earlier turn does not turn it on', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .library('Forest', 'Forest', 'Forest')
      .battlefield(FLAT)
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.act(0).playLand('Forest');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.act(0).tapForMana(FLAT);
    g.expect.pool(0, 'U');
  });
});

describe("with three seats only the controller's own land play counts (CR 305.1)", () => {
  test('a land another player plays in their turn does not turn it on, and their own copy turns on', () => {
    const g = scenario({ seats: 3 })
      .at('precombatMain', { active: 1 })
      .seat(0)
      .battlefield(FLAT)
      .seat(1)
      .hand('Forest')
      .battlefield(FLAT, { label: 'theirs' })
      .seat(2)
      .battlefield('Forest')
      .build();
    g.act(1).playLand('Forest');
    g.act(1).tapForMana('theirs');
    g.expect.pool(1, 'B');
    // Priority passes round the table (CR 117.3d); seat 0 taps its own land in seat 1's turn.
    g.act(1).pass();
    g.act(2).pass();
    g.act(0).tapForMana(FLAT);
    g.expect.pool(0, 'U');
  });
});
