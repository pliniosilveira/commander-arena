// "You may play an additional land on each of your turns." (D-125).
// Pins: CR 305.2 (Lands): a player can normally play one land during their turn; continuous effects may
// increase this number; CR 305.2a: the number of lands the player can play is compared with the number
// already played; CR 305.2b: no land when that number is reached; CR 305.3: never on another player's turn;
// CR 604.1 (static abilities work while the permanent is on the battlefield); CR 613.1f (an object that loses
// its abilities has none). All cards are SYNTHETIC (src/cards/fixtures/synthetic-play-rules.ts) or real
// fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PATH = 'SYNTHETIC Wandering Path';
const SCOUT = 'SYNTHETIC Wandering Scout';
const TWIN = 'SYNTHETIC Twin Path';
const SHARED = 'SYNTHETIC Shared Path';

/** Seat 0's first main phase with `lands` Forests in hand. */
function main(configure: (b: ReturnType<typeof scenario>) => unknown, lands = 4) {
  const b = scenario().seat(0).hand('Forest', { count: lands });
  configure(b);
  return b.seat(1).at('precombatMain', { active: 0, turn: 3 }).build();
}

describe('CR 305.2: one extra land drop', () => {
  test('without the ability the second land is refused (the baseline)', () => {
    const g = main(() => {});
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(1);
  });

  test('with it on the battlefield the controller plays two lands and not three', () => {
    const g = main((b) => b.battlefield(PATH));
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(2);
    g.act(0).playLand('Forest[0]');
    g.expect.legal(0, { playLand: 'Forest[0]' });
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(2);
    g.expect.zone('Forest', 'hand', { seat: 0, count: 2 });
  });

  test('it works in the second main phase as well, and the count carries across the turn', () => {
    const g = main((b) => b.battlefield(PATH));
    g.act(0).playLand('Forest[0]');
    g.advanceTo('postcombatMain');
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('a creature with the ability does the same as an enchantment', () => {
    const g = main((b) => b.battlefield(SCOUT));
    g.act(0).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('in the hand, the graveyard or the library it does nothing: only the battlefield counts', () => {
    const g = main((b) => b.hand(PATH).graveyard(PATH));
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });
});

describe('CR 305.2: several sources add up', () => {
  test('two sources give three land plays', () => {
    const g = main((b) => b.battlefield(PATH, SCOUT));
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(3);
    g.act(0).playLand('Forest[0]').playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('two copies of the same card add up as well', () => {
    const g = main((b) => b.battlefield(PATH, PATH));
    g.act(0).playLand('Forest[0]').playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('"two additional lands" gives three plays; with another source, four', () => {
    const one = main((b) => b.battlefield(TWIN));
    one.act(0).playLand('Forest[0]').playLand('Forest[0]').playLand('Forest[0]');
    one.expect.illegal(0, { playLand: 'Forest[0]' });
    const two = main((b) => b.battlefield(TWIN, PATH), 5);
    two
      .act(0)
      .playLand('Forest[0]')
      .playLand('Forest[0]')
      .playLand('Forest[0]')
      .playLand('Forest[0]');
    two.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('it adds to the extra drop an effect granted for this turn', () => {
    const b = scenario().seat(0).hand('Forest', { count: 4 }).battlefield(PATH);
    const g = b.seat(1).at('precombatMain', { active: 0, turn: 3, extraLandDrops: 1 }).build();
    g.act(0).playLand('Forest[0]').playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });
});

describe('CR 305.2, 305.3: whose turn and whose permanent', () => {
  test("an opponent's permanent gives me nothing", () => {
    const g = main((b) => b.seat(1).battlefield(PATH).seat(0));
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test("the extra drop is for its controller's turns only: in the opponent's turn I play no land at all", () => {
    const b = scenario().seat(0).battlefield(PATH).hand('Forest', { count: 2 });
    const g = b.seat(1).hand('Forest', { count: 3 }).at('precombatMain', { active: 1, turn: 4 });
    const game = g.build();
    // Seat 1 has no source: one land only. Seat 0 has priority? No: seat 0 never plays on seat 1's turn.
    game.act(1).playLand('Forest[0]');
    game.expect.illegal(1, { playLand: 'Forest[0]' });
    game.expect.illegal(0, { playLand: 'Forest[0]' });
    expect(game.view(1).seats[1]?.landPlaysAllowed).toBe(1);
    // The view still says what the owner of the permanent could play in their own turn.
    expect(game.view(0).seats[0]?.landPlaysAllowed).toBe(2);
  });

  test('"each player" gives the extra drop to a player who does not control the permanent', () => {
    const b = scenario().seat(0).hand('Forest', { count: 3 }).seat(1).battlefield(SHARED);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('"each player" gives it to its controller too, and in their own turn each has two', () => {
    const b = scenario().seat(0).battlefield(SHARED).hand('Forest', { count: 3 });
    const g = b
      .seat(1)
      .hand('Forest', { count: 3 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(1, { playLand: 'Forest[0]' });
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(2);
  });

  test('a land is never playable in the upkeep, whatever the limit says', () => {
    const b = scenario().seat(0).hand('Forest', { count: 2 }).battlefield(PATH);
    const g = b.seat(1).at('upkeep', { active: 0, turn: 3 }).build();
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });
});

describe('CR 305.2a, 604.1: the limit follows the board', () => {
  test('when the source dies after one land, the second land is refused', () => {
    const b = scenario()
      .seat(0)
      .hand('Forest', { count: 3 })
      .battlefield(SCOUT, 'Mountain')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain');
    const g = b.at('precombatMain', { active: 0, turn: 3, priority: 0 }).build();
    g.act(0).playLand('Forest[0]');
    g.expect.legal(0, { playLand: 'Forest[0]' });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [SCOUT], pay: true });
    g.passAll();
    g.expect.zone(SCOUT, 'graveyard', { seat: 0 });
    g.expect.step('precombatMain', { active: 0, turn: 3 });
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    // The land that was played stays.
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
  });

  test('a source that comes in after a land was played raises the limit for the rest of the turn', () => {
    const g = main((b) => b.hand(SCOUT).battlefield('Forest', 'Forest'));
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    g.act(0).cast(SCOUT, { pay: true });
    g.passAll();
    g.expect.zone(SCOUT, 'battlefield', { seat: 0 });
    g.act(0).playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('the count starts over every turn: the next turn the source still gives two plays', () => {
    const b = scenario()
      .seat(0)
      .hand('Forest', { count: 6 })
      .battlefield(PATH)
      .library('Island', { count: 4 });
    const g = b
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).playLand('Forest[0]').playLand('Forest[0]');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0, turn: 5 });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(0);
    g.act(0).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('a land that asks a question as it enters is counted once it is played', () => {
    const g = main((b) => b.battlefield(PATH).hand('SYNTHETIC Tapped Land'));
    g.act(0).playLand('SYNTHETIC Tapped Land').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });
});

describe('determinism', () => {
  test('the same actions from the same position give the same state hash, and the extra play is in it', () => {
    const play = () => {
      const g = main((b) => b.battlefield(PATH));
      const before = g.hash();
      g.act(0).playLand('Forest[0]').playLand('Forest[0]');
      return { before, after: g.hash(), log: g.log.length };
    };
    const one = play();
    const two = play();
    expect(one).toEqual(two);
    expect(one.after).not.toBe(one.before);
  });
});

describe('validation and features', () => {
  test('a card whose count is wrong is refused with a reason that names the ability', () => {
    const def = scenario()
      .seat(0)
      .battlefield(PATH)
      .build()
      .state.definitions.find((d) => d.name === PATH);
    if (!def) throw new Error('missing fixture');
    const face = def.faces[0];
    if (!face) throw new Error('missing face');
    const bad = { ...def, faces: [{ ...face, abilities: [ability(0)] }] };
    const issues = validateCard(bad);
    expect(issues.map((i) => i.message)).toEqual(['count must be a whole number of at least 1']);
  });

  const ability = (count: unknown, eachPlayer?: unknown): Ability =>
    ({ kind: 'static', static: { kind: 'additionalLandDrops', count, eachPlayer } }) as never;

  test('a positive whole count is valid, with or without eachPlayer: true', () => {
    expect(validateAbility(ability(1))).toEqual([]);
    expect(validateAbility(ability(3, true))).toEqual([]);
  });

  test.each([0, -1, 1.5, Number.NaN, '1', undefined])(
    'count %s is refused with a reason',
    (count) => {
      expect(validateAbility(ability(count)).map((i) => i.path)).toEqual(['ability.static.count']);
    },
  );

  test('eachPlayer must be true when it is there', () => {
    expect(validateAbility(ability(1, false)).map((i) => i.path)).toEqual([
      'ability.static.eachPlayer',
    ]);
  });

  test.each([PATH, SCOUT, TWIN, SHARED])('the fixture %s is a valid, supported card', (name) => {
    const def = scenario()
      .seat(0)
      .battlefield(name)
      .build()
      .state.definitions.find((d) => d.name === name);
    expect(def && validateCard(def)).toEqual([]);
  });
});
