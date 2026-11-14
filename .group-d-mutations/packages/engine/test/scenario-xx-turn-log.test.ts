// "{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn. Activate only
// once each turn." (D-139): `ObjectFilter.manaValueX` and `controllerDealtDamageBySource`, and the `oncePerTurn` flag of an activated ability.
// Pins: CR 510.2 (combat damage), CR 202.3 (mana value), CR 107.3a (X), CR 602.5b (activate only once each turn), CR 400.7 (a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-turnlog.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HELLKITE = 'SYNTHETIC Brand Hellkite'; // 4/4 flying: {X}: destroy each nonland permanent with MV X of players it hit; once each turn
const WYRM = 'SYNTHETIC Reprisal Wyrm'; // 4/4: {1}: destroy each creature of the players it hit this turn
const WELL = 'SYNTHETIC Daily Well'; // {1}: draw a card; once each turn
const TWIN = 'SYNTHETIC Twin Well'; // {1}: draw a card, {2}: gain 2 life; each once each turn
const DRONE = 'SYNTHETIC Colorless Drone'; // MV 2 artifact creature
const JUGGERNAUT = 'SYNTHETIC Dust Juggernaut'; // MV 4 artifact creature
const WARD = 'SYNTHETIC Dull Ward'; // MV 2 enchantment
const WALL = 'SYNTHETIC Brick Wall'; // 0/5 defender, MV 2
const BEARS = 'Grizzly Bears'; // MV 2
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function board(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder) {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain', { count: 6 })
      .library(...FILLER),
  );
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
}

describe('the cards are valid', () => {
  test.each([HELLKITE, WYRM, WELL, TWIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('mana value X of a player the creature hit (CR 510.2, 202.3, 107.3a)', () => {
  const hit = () => {
    const g = board(
      (b) => b.battlefield(HELLKITE).battlefield(BEARS),
      (b) => b.battlefield(DRONE).battlefield(WARD).battlefield(JUGGERNAUT).battlefield('Forest'),
    );
    g.playCombat({ attack: [HELLKITE], until: 'combatDamage' });
    g.expect.life(1, 16);
    return g;
  };

  test('X = 2 destroys the opponent permanents of mana value 2, not the others, not lands, not my own', () => {
    const g = hit();
    g.act(0).activate(HELLKITE, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone(WARD, 'graveyard', { seat: 1 });
    g.expect.zone(JUGGERNAUT, 'battlefield', { seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('X = 4 destroys only the mana value 4 permanent', () => {
    const g = hit();
    g.act(0).activate(HELLKITE, { x: 4, pay: true });
    g.passAll();
    g.expect.zone(JUGGERNAUT, 'graveyard', { seat: 1 });
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });

  test('X = 0 does not destroy a land: the filter is nonland', () => {
    const g = hit();
    g.act(0).activate(HELLKITE, { x: 0, pay: true });
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 1 });
  });

  test('without combat damage to the player, nothing is destroyed', () => {
    const g = board(
      (b) => b.battlefield(HELLKITE),
      (b) => b.battlefield(DRONE),
    );
    g.act(0).activate(HELLKITE, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });

  test('a blocked creature deals no damage to the player: nothing is destroyed', () => {
    const g = board(
      (b) => b.battlefield(WYRM),
      (b) => b.battlefield(DRONE).battlefield(WALL),
    );
    g.playCombat({
      attack: [WYRM],
      block: [{ blocker: WALL, attacker: WYRM }],
      until: 'combatDamage',
    });
    g.expect.life(1, 20);
    g.act(0).activate(WYRM, { pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });

  test('once each turn: the second activation is refused, and legal again the next turn', () => {
    const g = hit();
    g.act(0).activate(HELLKITE, { x: 2, pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: HELLKITE });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { activate: HELLKITE });
  });

  test('the record of the damage is emptied as the turn ends', () => {
    const g = board(
      (b) => b.battlefield(HELLKITE),
      (b) => b.battlefield(DRONE),
    );
    g.playCombat({ attack: [HELLKITE], until: 'combatDamage' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(HELLKITE, { x: 2, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });
});

describe('every creature of a player the source hit, no X (CR 510.2)', () => {
  test('only the creatures of the player that was dealt damage, repeatedly', () => {
    const g = board(
      (b) => b.battlefield(WYRM).battlefield(BEARS),
      (b) => b.battlefield(DRONE).battlefield(WARD),
    );
    g.playCombat({ attack: [WYRM], until: 'combatDamage' });
    g.act(0).activate(WYRM, { pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone(WARD, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    // No once-each-turn flag here: it can be activated again.
    g.expect.legal(0, { activate: WYRM });
  });

  test('damage the creature dealt with its own ability is not combat damage: it does not count', () => {
    const g = board(
      (b) => b.battlefield(WYRM),
      (b) => b.battlefield(DRONE),
    );
    g.act(0).activate(WYRM, { ability: 1, pay: true });
    g.passAll();
    g.expect.life(1, 19);
    g.act(0).activate(WYRM, { ability: 0, pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });

  test('damage dealt by another creature does not count', () => {
    const g = board(
      (b) => b.battlefield(WYRM).battlefield(BEARS),
      (b) => b.battlefield(DRONE),
    );
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.act(0).activate(WYRM, { pay: true });
    g.passAll();
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
  });
});

describe('activate only once each turn (CR 602.5b)', () => {
  test('a second activation is refused; a second permanent with the same ability has its own count', () => {
    const g = board(
      (b) => b.battlefield(WELL, { label: 'a' }).battlefield(WELL, { label: 'b' }),
      (b) => b,
    );
    g.act(0).activate('a', { pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: 'a' });
    g.expect.legal(0, { activate: 'b' });
    g.act(0).activate('b', { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('another ability of the same permanent has its own count', () => {
    const g = board(
      (b) => b.battlefield(TWIN),
      (b) => b,
    );
    g.act(0).activate(TWIN, { ability: 0, pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: TWIN, ability: 0 });
    g.expect.legal(0, { activate: TWIN, ability: 1 });
    g.act(0).activate(TWIN, { ability: 1, pay: true });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.illegal(0, { activate: TWIN, ability: 1 });
  });

  test('an activation that was never completed does not count', () => {
    const g = board(
      (b) => b.battlefield(WELL),
      (b) => b,
    );
    g.act(0).activate(WELL);
    g.act(0).cancel();
    g.expect.legal(0, { activate: WELL });
  });
});
