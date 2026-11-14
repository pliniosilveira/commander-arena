// "You have hexproof", "You can't lose the game and your opponents can't win the game", "Prevent all combat damage that would be dealt to this
// creature", "You can't cast ~ during your first, second, or third turns of the game" and "Activate only if you control three or more lands
// with the same name" (D-149).
// Pins: CR 702.11b (hexproof: a player too), CR 115.1 (a target must be legal as it is chosen and as it resolves), CR 104.3 and 104.3a (the ways
// to lose, concession among them), CR 704.5a-c and 704.6c (state-based actions), CR 104.2a (the last player wins whatever precludes it),
// CR 615.1 and 615.6 (prevention of damage, which is then never dealt), CR 120.3f (lifelink needs damage dealt), CR 101.2 ("can't" beats "can"),
// CR 500.1 (turns of the game), CR 602.5b (a restriction on activating). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-angels-statics.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARDED = 'SYNTHETIC Warded Angel';
const HERALD = 'SYNTHETIC Undying Herald';
const SHIELDED = 'SYNTHETIC Shielded Seraph';
const STONE = 'SYNTHETIC Stone Seraph';
const LATE = 'SYNTHETIC Late Avenger';
const QUICK = 'SYNTHETIC Quick Avenger';
const ATLAS = 'SYNTHETIC Land Atlas';
const DISCARD = 'SYNTHETIC Opponent Discards Two';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk"; // 1/1 flying lifelink
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([WARDED, HERALD, SHIELDED, STONE, LATE, QUICK, ATLAS])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"You have hexproof"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARDED, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT, BOLT, DISCARD)
      .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp')
      .build();

  const legalTargetsOf = (g: ReturnType<typeof game>, seat: 0 | 1, card: string) => {
    g.act(seat).cast(`${card}[0]`);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return d.specs[0]?.legal ?? [];
  };

  test("an opponent's Bolt can't target me, and can target the opponent and the creature", () => {
    const g = game();
    g.act(0).pass();
    const legal = legalTargetsOf(g, 1, BOLT);
    expect(legal.some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
    expect(legal.some((t) => t.kind === 'player' && t.seat === 1)).toBe(true);
    expect(legal.some((t) => t.kind === 'object' && t.id === g.id(WARDED))).toBe(true);
  });

  test('my own Bolt can target me', () => {
    const g = game();
    const legal = legalTargetsOf(g, 0, BOLT);
    expect(legal.some((t) => t.kind === 'player' && t.seat === 0)).toBe(true);
  });

  test('a spell that can only target me can not be cast', () => {
    const g = game();
    g.act(0).pass();
    g.expect.illegal(1, { cast: DISCARD });
  });

  test("it works only while the creature is there: after it dies an opponent's spell can target me", () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [WARDED], pay: true });
    g.passAll();
    g.expect.zone(WARDED, 'graveyard', { seat: 0 });
    g.act(0).pass();
    const legal = legalTargetsOf(g, 1, BOLT);
    expect(legal.some((t) => t.kind === 'player' && t.seat === 0)).toBe(true);
  });

  test('"whenever this creature is dealt damage, you gain that much life"', () => {
    const g = game();
    g.act(0).pass();
    g.act(1).cast(`${BOLT}[0]`, { targets: [WARDED], pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });
});

describe('"You can\'t lose the game and your opponents can\'t win the game"', () => {
  const sbaGame = (setup: (b: ReturnType<typeof scenario>) => void, herald: boolean) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY);
    if (herald) b.battlefield(HERALD);
    setup(b);
    return b
      .seat(1)
      .library(...LIBRARY)
      .build({ settle: true });
  };

  test('0 life does not lose the game', () => {
    const g = sbaGame((b) => b.life(0), true);
    g.expect.hasLost(0, false);
    g.expect.life(0, 0);
  });

  test('negative life does not lose the game, and the game goes on', () => {
    const g = sbaGame((b) => b.life(-7), true);
    g.expect.hasLost(0, false);
    g.act(0).pass();
    g.expect.hasLost(0, false);
  });

  test('without the creature 0 life loses', () => {
    const g = sbaGame((b) => b.life(0), false);
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test('ten poison counters do not lose it, and lose it without', () => {
    const withHerald = sbaGame((b) => b.poison(10), true);
    withHerald.expect.hasLost(0, false);
    const without = sbaGame((b) => b.poison(10), false);
    without.expect.hasLost(0, true);
  });

  test('21 combat damage from one commander does not lose it, and loses it without', () => {
    const build = (herald: boolean) => {
      const b = scenario()
        .seat(0)
        .library(...LIBRARY);
      if (herald) b.battlefield(HERALD);
      return b
        .commanderDamageTaken('Isamaru, Hound of Konda', 21)
        .seat(1)
        .library(...LIBRARY)
        .command('Isamaru, Hound of Konda', { commander: true })
        .build({ settle: true });
    };
    build(true).expect.hasLost(0, false);
    build(false).expect.hasLost(0, true);
  });

  test('drawing from an empty library does not lose it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(HERALD)
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1 })
      .build();
    g.advanceTo('draw', { turn: 'next' });
    g.expect.hasLost(0, false);
  });

  test('it is lost with the creature: when it leaves, the next state-based action ends the game', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(0)
      .battlefield(HERALD)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build({ settle: true });
    g.expect.hasLost(0, false);
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [HERALD], pay: true });
    g.passAll();
    g.expect.zone(HERALD, 'graveyard', { seat: 0 });
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test('conceding still loses the game (CR 104.3a)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HERALD)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).concede();
    g.expect.hasLost(0, true);
    g.expect.gameOver({ win: 1 });
  });

  test("the opponent of the Herald's controller loses normally", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HERALD)
      .seat(1)
      .life(0)
      .library(...LIBRARY)
      .build({ settle: true });
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });
});

describe('"Prevent all combat damage that would be dealt to this creature"', () => {
  const combat = (seraph: string) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(seraph, { label: 'seraph' })
      .build();

  test('a blocked attacker deals no damage to it', () => {
    const g = combat(SHIELDED);
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: 'seraph', attacker: BEARS }],
      until: 'endOfCombat',
    });
    g.expect.damage('seraph', 0);
    g.expect.zone(SHIELDED, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 }); // the Seraph still deals its 3 damage
  });

  test('damage that is not combat damage is dealt', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SHIELDED, { label: 'seraph' })
      .build();
    g.act(0).cast(BOLT, { targets: ['seraph'], pay: true });
    g.passAll();
    g.expect.zone(SHIELDED, 'graveyard', { seat: 1 });
  });

  test('a lifelink creature it prevents the damage of does not gain life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HAWK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SHIELDED, { label: 'seraph' })
      .build();
    g.playCombat({
      attack: [HAWK],
      block: [{ blocker: 'seraph', attacker: HAWK }],
      until: 'endOfCombat',
    });
    g.expect.life(0, 40);
    g.expect.noEvent({ kind: 'lifeGained' });
  });

  test('a prevention that says all damage stops a Bolt too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(STONE, { label: 'seraph' })
      .build();
    g.act(0).cast(BOLT, { targets: ['seraph'], pay: true });
    g.passAll();
    g.expect.zone(STONE, 'battlefield', { seat: 1 });
    g.expect.damage('seraph', 0);
  });

  test("combat damage to the player is not prevented (only 'to this creature')", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SHIELDED)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.playCombat({ attack: [SHIELDED], until: 'endOfCombat' });
    g.expect.life(1, 37);
  });
});

describe('"You can\'t cast ~ during your first, second, or third turns of the game"', () => {
  const at = (turn: number, active: 0 | 1, card: string) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', 'Plains');
    const c = active === 0 ? b.hand(card) : b;
    return c
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Plains', 'Plains')
      .hand(...(active === 1 ? [card] : []))
      .at('precombatMain', { active, turn })
      .build();
  };

  test.each([
    [1, 0],
    [3, 0],
    [5, 0],
    [2, 1],
    [4, 1],
    [6, 1],
  ] as const)('turn %i of the game (seat %i): not castable', (turn, seat) => {
    const g = at(turn, seat, LATE);
    g.expect.illegal(seat, { cast: LATE });
  });

  test.each([
    [7, 0],
    [9, 0],
    [8, 1],
    [10, 1],
  ] as const)('turn %i of the game (seat %i): castable', (turn, seat) => {
    const g = at(turn, seat, LATE);
    g.expect.legal(seat, { cast: LATE });
    g.act(seat).cast(LATE, { pay: true });
    g.passAll();
    g.expect.zone(LATE, 'battlefield', { seat });
  });

  test('the same real game: the first three turns of the player cannot, the fourth can', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(LATE)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.illegal(0, { cast: LATE });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: LATE });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.illegal(0, { cast: LATE });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { cast: LATE });
  });

  test('a flash creature can be cast in the opponent\'s turn: it is not "your" turn', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(QUICK)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).pass();
    g.expect.legal(0, { cast: QUICK });
  });

  test('a flash creature can not be cast in my own early turn', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(QUICK)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.expect.illegal(0, { cast: QUICK });
  });
});

describe('"Activate only if you control three or more lands with the same name"', () => {
  const game = (...lands: string[]) =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ATLAS, ...lands)
      .seat(1)
      .build();

  test('three Plains: the Atlas draws a card', () => {
    const g = game('Plains', 'Plains', 'Plains', 'Forest');
    g.expect.legal(0, { activate: ATLAS });
    g.act(0).activate(ATLAS, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('two Plains and two Forests: it can not be activated', () => {
    const g = game('Plains', 'Plains', 'Forest', 'Forest');
    g.expect.illegal(0, { activate: ATLAS });
  });

  test('four different names: it can not be activated', () => {
    const g = game('Plains', 'Forest', 'Island', 'Mountain');
    g.expect.illegal(0, { activate: ATLAS });
  });

  test('lands of the opponent do not count', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ATLAS, 'Plains', 'Plains', 'Forest')
      .seat(1)
      .battlefield('Plains', 'Plains')
      .build();
    g.expect.illegal(0, { activate: ATLAS });
  });
});
