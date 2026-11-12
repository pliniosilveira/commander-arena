// "Each player this creature attacked this turn loses the game" (D-269): the effect `loseGame` (CR 104.3e) with the selector `attackedPlayers` (CR 508.6),
// "Whenever a creature you control deals combat damage to a player, you and that player each gain that much life", and an intervening "if you have at least 15
// life more than your starting life total" (CR 603.4). Cards are SYNTHETIC (src/cards/fixtures/synthetic-lose-game.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DESTINY = 'SYNTHETIC Destiny Angel'; // flying, double strike, the shared gain, the loss
const DOOM = 'SYNTHETIC Doom Angel'; // flying 3/3, the loss alone
const BANNER = 'SYNTHETIC Doom Banner'; // the same ability on an artifact
const HERALD = 'SYNTHETIC Doom Herald'; // "each opponent loses the game"
const EVERYONE = 'SYNTHETIC Doom Everyone'; // "each player loses the game"
const UNDYING = 'SYNTHETIC Undying Herald'; // "You can't lose the game and your opponents can't win the game."
const WALKER = 'SYNTHETIC Loyalty Walker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk"; // a flying creature that can block the angels
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Seat 0 has the creature with 55 life (40 starting life + 15), in the precombat main phase; seat 1 has nothing. */
const base = (...mine: string[]) =>
  scenario()
    .seat(0)
    .life(55)
    .library(...LIBRARY)
    .battlefield(...mine)
    .seat(1)
    .library(...LIBRARY);

describe('the cards are valid', () => {
  test.each([DESTINY, DOOM, BANNER, HERALD, EVERYONE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('"each player this creature attacked this turn" is the ability of a permanent, not a spell', () => {
    const card = syntheticCard(BANNER);
    const spell = {
      ...card,
      faces: card.faces.map((face) => ({
        ...face,
        types: ['sorcery' as const],
        abilities: [],
        spell: {
          kind: 'spell' as const,
          effect: {
            kind: 'loseGame' as const,
            player: { kind: 'attackedPlayers' as const, of: { kind: 'this' as const } },
          },
        },
      })),
    };
    expect(
      validateCard(spell as never)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/attackedPlayers/);
  });

  test('only "this" is read: the attacks of another permanent are not', () => {
    const card = syntheticCard(DOOM);
    const bad = {
      ...card,
      faces: card.faces.map((face) => ({
        ...face,
        abilities: face.abilities.map((a) =>
          a.kind === 'triggered'
            ? {
                ...a,
                effect: {
                  kind: 'loseGame' as const,
                  player: {
                    kind: 'attackedPlayers' as const,
                    of: { kind: 'target' as const, id: 't1' },
                  },
                },
              }
            : a,
        ),
      })),
    };
    expect(
      validateCard(bad as never)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/attackedPlayers/);
  });

  test('one player becomes the monarch: a selector that may name several is refused', () => {
    const card = syntheticCard(DOOM);
    const bad = {
      ...card,
      faces: card.faces.map((face) => ({
        ...face,
        abilities: face.abilities.map((a) =>
          a.kind === 'triggered'
            ? {
                ...a,
                effect: {
                  kind: 'becomeMonarch' as const,
                  player: { kind: 'attackedPlayers' as const, of: { kind: 'this' as const } },
                },
              }
            : a,
        ),
      })),
    };
    expect(
      validateCard(bad as never)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/monarch/);
  });
});

describe('the turn log keeps the players an attacker attacked (CR 508.6)', () => {
  test('a creature that attacks a player is on the list with that player', () => {
    const g = base(DOOM).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    expect(g.state.turnLog.attackedPlayers).toEqual([{ attacker: g.id(DOOM), player: 1 }]);
  });

  test('a creature that attacks a planeswalker has not attacked its controller', () => {
    const g = base(DOOM).battlefield(WALKER).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM, WALKER);
    expect(g.state.turnLog.attacked).toEqual([g.id(DOOM)]);
    expect(g.state.turnLog.attackedPlayers).toEqual([]);
  });

  test('a new turn starts the list again', () => {
    const g = base(DOOM).seat(0).life(54).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    expect(g.state.turnLog.attackedPlayers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turnLog.attackedPlayers).toEqual([]);
  });
});

describe('"each player this creature attacked this turn loses the game" at the end step', () => {
  test('with the life, the player it attacked loses and the other player wins (CR 104.3e, 104.2a)', () => {
    const g = base(DOOM).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.hasLost(0, false);
    g.expect.gameOver({ win: 0 });
    g.expect.invariants();
  });

  test('14 life above the starting life total is not enough: the ability does not trigger (CR 603.4)', () => {
    const g = base(DOOM).seat(0).life(54).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    g.advanceTo('end');
    g.expect.stack([]);
    g.passAll();
    g.expect.hasLost(1, false);
  });

  test('a creature that did not attack names nobody: the ability resolves and the game goes on', () => {
    const g = base(DOOM).at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    g.expect.stack([`${DOOM} (ability)`]);
    g.passAll();
    g.expect.hasLost(1, false);
    expect(g.state.result).toBeNull();
  });

  test('an attack on a planeswalker is not an attack on its controller (CR 506.3, 508.6)', () => {
    const g = base(DOOM).seat(1).battlefield(WALKER).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM, WALKER);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
    expect(g.state.result).toBeNull();
  });

  test('a permanent that is not a creature attacked nobody', () => {
    const g = base(BANNER, BEARS).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
  });

  test('only the creature that has the ability counts: another creature that attacked does not', () => {
    const g = base(DOOM, BEARS).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
  });

  test('the creature is read as it was when it has left the battlefield by the time the ability resolves (CR 608.2h)', () => {
    const g = base(DOOM)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    g.advanceTo('end');
    g.expect.stack([`${DOOM} (ability)`]);
    g.pass(0);
    g.act(1)
      .cast(BOLT, { targets: [DOOM] })
      .pay();
    g.passAll();
    g.expect.zone(DOOM, 'graveyard');
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });

  test("a player who can't lose the game does not (CR 101.2)", () => {
    const g = base(DOOM).seat(1).battlefield(UNDYING).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DOOM);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
    expect(g.state.result).toBeNull();
  });
});

describe('the loss is an effect like any other (CR 104.3e)', () => {
  test('"each opponent loses the game" ends the game', () => {
    const g = base(HERALD).at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
    g.expect.eventLog([{ kind: 'playerLost', seat: 1, reason: 'effect' }]);
  });

  test('the monarch who loses to the effect hands the designation to the active player (CR 725.4)', () => {
    const g = base(HERALD).at('precombatMain', { active: 0, monarch: 1 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.monarch(0);
    g.expect.eventLog([
      { kind: 'playerLost', seat: 1, reason: 'effect' },
      { kind: 'monarchChanged', from: 1, to: 0 },
    ]);
  });

  test('every player losing at once is a draw (CR 104.4a)', () => {
    const g = base(EVERYONE).at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(0, true);
    g.expect.hasLost(1, true);
    g.expect.gameOver('draw');
  });

  test('the controller who can\'t lose stays: "each player loses" is then a loss for the other player only', () => {
    const g = base(EVERYONE, UNDYING).at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(0, false);
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });
});

describe('"you and that player each gain that much life"', () => {
  test('double strike: each of the two damage events gains the damage to both players', () => {
    const g = base(DESTINY).seat(0).life(40).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DESTINY);
    g.advanceTo('endOfCombat');
    // 2 first-strike damage and 2 regular damage: the player is at 36, and each trigger gave 2 to both.
    g.passAll();
    g.expect.life(0, 44);
    g.expect.life(1, 40);
  });

  test('every creature you control triggers it, with its own damage', () => {
    const g = base(DESTINY, BEARS).seat(0).life(40).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 40);
  });

  test('damage the creature deals to a creature does not trigger it', () => {
    const g = base(DESTINY)
      .seat(0)
      .life(40)
      .seat(1)
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DESTINY);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: HAWK, attacker: DESTINY }]);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });

  test('a batch of damage names the damaged player too: one trigger for creatures that hit together', () => {
    const g = base('SYNTHETIC Batch Angel', BEARS, BEARS)
      .seat(0)
      .life(40)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([`${BEARS}[0]`, `${BEARS}[1]`]);
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 37);
  });

  test('the whole card: the life it gains crosses 15 above the starting total and the opponent loses at the end step', () => {
    const g = base(DESTINY).seat(0).life(53).at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(DESTINY);
    g.advanceTo('end');
    g.expect.life(0, 57);
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });
});
