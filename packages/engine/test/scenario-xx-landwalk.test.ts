// Landwalk (CR 702.14): islandwalk, a non-basic-land-type walk (Desertwalk) and nonbasic landwalk.
// Pins: CR 702.14c (a creature with landwalk can't be blocked as long as the defending player
// controls at least one land with the specified land type, or without the specified supertype as
// in "nonbasic landwalk"), CR 702.14d (landwalk abilities don't "cancel" one another), CR 702.14e
// (multiple instances are redundant), CR 509.1b (the restriction is read when blockers are
// declared; an attacker that gains or loses it after a legal block is unaffected), CR 305.6 (a
// land with a basic land type has the intrinsic mana ability; nonbasic lands can have types too).
// Cards: SYNTHETIC Islandwalker, Desertwalker and Nonbasic Walker, SYNTHETIC Dual Island (a
// nonbasic land with types Island and Swamp) and Dry Desert (src/cards/fixtures/synthetic-
// restrictions.ts), Grizzly Bears and the basic lands.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { attackedGame, canBlock } from './restriction-helpers';

const ISLANDWALKER = 'SYNTHETIC Islandwalker';
const DESERTWALKER = 'SYNTHETIC Desertwalker';
const NONBASIC_WALKER = 'SYNTHETIC Nonbasic Walker';
const DUAL = 'SYNTHETIC Dual Island';
const DESERT = 'SYNTHETIC Dry Desert';
const BEARS = 'Grizzly Bears';

describe('CR 702.14c: islandwalk', () => {
  test('the defending player controls an Island: nothing can block the attacker', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield('Island', BEARS));
    g.expect.pending('priority', 0);
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(false);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('no Island: the attacker can be blocked as usual', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield('Forest', 'Swamp', BEARS));
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(true);
  });

  test('a nonbasic land with the Island land type counts (CR 702.14c: the type, not the supertype)', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield(DUAL, BEARS));
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(false);
  });

  test("an Island the attacker's controller controls does not matter: it is the defender's lands", () => {
    const g = attackedGame(
      [ISLANDWALKER],
      (b) => b.battlefield(BEARS),
      (b) => b.battlefield('Island'),
    );
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(true);
  });

  test('a land that is not an Island (a Desert) does not count', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield(DESERT, BEARS));
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(true);
  });

  test('a tapped Island still counts (CR 702.14c: "controls", not "untapped")', () => {
    const g = attackedGame([ISLANDWALKER], (b) =>
      b.battlefield(BEARS).battlefield('Island', { tapped: true }),
    );
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(false);
  });
});

describe('CR 702.14a: the type may be any land type, a Desert for example', () => {
  test('Desertwalk is stopped by a Desert and by nothing else', () => {
    const blocked = attackedGame([DESERTWALKER], (b) => b.battlefield(DESERT, BEARS));
    expect(canBlock(blocked, BEARS, DESERTWALKER)).toBe(false);
    const open = attackedGame([DESERTWALKER], (b) => b.battlefield('Island', 'Mountain', BEARS));
    expect(canBlock(open, BEARS, DESERTWALKER)).toBe(true);
  });
});

describe('CR 702.14c: nonbasic landwalk', () => {
  test('a land that is not basic makes the attacker unblockable', () => {
    for (const land of [DUAL, DESERT]) {
      const g = attackedGame([NONBASIC_WALKER], (b) => b.battlefield(land, BEARS));
      expect(canBlock(g, BEARS, NONBASIC_WALKER), land).toBe(false);
    }
  });

  test('only basic lands: the attacker can be blocked', () => {
    const g = attackedGame([NONBASIC_WALKER], (b) =>
      b.battlefield('Island', 'Forest', 'Swamp', 'Plains', 'Mountain', BEARS),
    );
    expect(canBlock(g, BEARS, NONBASIC_WALKER)).toBe(true);
  });

  test('a nonbasic permanent that is not a land does not count', () => {
    const g = attackedGame([NONBASIC_WALKER], (b) => b.battlefield('Sol Ring', BEARS));
    expect(canBlock(g, BEARS, NONBASIC_WALKER)).toBe(true);
  });

  test('Command Tower (a real nonbasic land) does', () => {
    const g = attackedGame([NONBASIC_WALKER], (b) => b.battlefield('Command Tower', BEARS));
    expect(canBlock(g, BEARS, NONBASIC_WALKER)).toBe(false);
  });
});

describe('CR 702.14d: landwalk does not cancel, and is read for each attacker', () => {
  test('an Islandwalker of the defender does not let an Islandwalker attacker be blocked', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield(ISLANDWALKER, 'Island'));
    expect(canBlock(g, { name: ISLANDWALKER, seat: 1 }, { name: ISLANDWALKER, seat: 0 })).toBe(
      false,
    );
  });

  test('two attackers: the one without the keyword is blocked, the walker is not', () => {
    const g = attackedGame([ISLANDWALKER, 'SYNTHETIC Vanilla 3/3'], (b) =>
      b.battlefield('Island', BEARS),
    );
    expect(canBlock(g, BEARS, ISLANDWALKER)).toBe(false);
    expect(canBlock(g, BEARS, 'SYNTHETIC Vanilla 3/3')).toBe(true);
  });

  test('it is a keyword of the creature: derive lists it with its land type', () => {
    const g = scenario().seat(0).battlefield(ISLANDWALKER).seat(1).build();
    expect(derive(g.state, g.object(ISLANDWALKER)).abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'landwalk', landType: 'Island' } },
    ]);
  });
});

describe('CR 509.1b: it is read when blockers are declared, not afterwards', () => {
  test('a block that was legal when declared is declared and stays', () => {
    const g = attackedGame([ISLANDWALKER], (b) => b.battlefield(BEARS));
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: ISLANDWALKER }]);
    g.expect.combat({ blocked: [ISLANDWALKER] });
  });
});
