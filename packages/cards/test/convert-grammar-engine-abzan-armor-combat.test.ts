// Abzan Armor deck, group A (combat): Assault Formation, Wakestone Gargoyle, Weathered Sentinels and Walking Bulwark, read from their real Oracle text and run by the engine.
// "Each creature you control assigns combat damage equal to its toughness rather than its power." and "{G}: Target creature with defender can attack this turn as though it didn't have defender."
// "{1}{W}: Creatures you control with defender can attack this turn as though they didn't have defender."
// "This creature can attack players who attacked you during their last turn as though it didn't have defender." with "Whenever this creature attacks, it gets +3/+3 and gains indestructible until end of turn."
// "{2}: Until end of turn, target creature with defender gains haste, can attack as though it didn't have defender, and assigns combat damage equal to its toughness rather than its power. Activate only as a sorcery."
// Pins: CR 702.3b (a creature with defender can't attack), CR 609.4 (an "as though" effect changes only what it names), CR 510.1a (combat damage is the power, or what an effect says), CR 611.2c (a
// rule change on a group reaches creatures that arrive later), CR 508.6 ("attacked you"), CR 302.6 and 702.10 (summoning sickness, haste), CR 602.5d (sorcery-speed activation).
// The rulings of Scryfall are in the comments of the tests they decide.
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const FORMATION = real('Assault Formation');
const GARGOYLE = real('Wakestone Gargoyle');
const SENTINELS = real('Weathered Sentinels');
const BULWARK = real('Walking Bulwark');
const GUARDIAN = real('Axebane Guardian'); // 0/3, defender
const BEARS = 'Grizzly Bears';

/** Whether the engine accepts seat `seat` declaring `attacker` attacking player `at`. */
function canAttack(g: ScenarioGame, seat: number, attacker: string, at: number): boolean {
  return applyAction(g.state, seat, {
    kind: 'declareAttackers',
    attacks: [{ attacker: g.id(attacker), target: { kind: 'player', seat: at } }],
  }).ok;
}

describe('Assault Formation', () => {
  const board = () => {
    const b = scenario()
      .define(FORMATION)
      .define(GUARDIAN)
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(FORMATION.name, GUARDIAN.name, 'Forest', 'Forest', 'Forest', 'Forest');
    return b.seat(1).library('Forest', { count: 6 }).at('precombatMain', { active: 0 }).build();
  };

  test('each creature you control assigns combat damage equal to its toughness: an unblocked 0/3 that attacks deals 3 (CR 510.1a, 510.1b)', () => {
    const g = board();
    g.act(0).activate(FORMATION.name, { ability: 1, targets: [GUARDIAN.name], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(GUARDIAN.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 37);
  });

  test('{G}: a creature with defender can not attack before it (CR 702.3b), and can after it (CR 609.4)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(false);
    const h = board();
    h.act(0).activate(FORMATION.name, { ability: 1, targets: [GUARDIAN.name], pay: true });
    h.passAll();
    h.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(h, 0, GUARDIAN.name, 1)).toBe(true);
  });

  test("Assault Formation's first ability changes only the damage it assigns: power and toughness stay (ruling 2017-11-17)", () => {
    const g = board();
    g.expect.pt(GUARDIAN.name, 0, 3);
  });

  test('{2}{G}: creatures you control get +0/+1 and so assign one more damage', () => {
    const g = board();
    g.act(0).activate(FORMATION.name, { ability: 1, targets: [GUARDIAN.name], pay: true });
    g.passAll();
    g.act(0).activate(FORMATION.name, { ability: 2, pay: true });
    g.passAll();
    g.expect.pt(GUARDIAN.name, 0, 4);
    g.advanceTo('declareAttackers');
    g.act(0).attack(GUARDIAN.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 36);
  });

  test('with three seats the creature attacks the chosen opponent and damages only them', () => {
    const g = scenario({ seats: 3 })
      .define(FORMATION)
      .define(GUARDIAN)
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(FORMATION.name, GUARDIAN.name, 'Forest')
      .seat(1)
      .library('Forest', { count: 6 })
      .seat(2)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(FORMATION.name, { ability: 1, targets: [GUARDIAN.name], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(GUARDIAN.name, { player: 2 });
    g.advanceTo('postcombatMain');
    g.expect.life(2, 37);
    g.expect.life(1, 40);
  });
});

describe('Wakestone Gargoyle', () => {
  const board = () =>
    scenario()
      .define(GARGOYLE)
      .define(GUARDIAN)
      .seat(0)
      .library('Plains', { count: 6 })
      .battlefield(GARGOYLE.name, GUARDIAN.name, 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('before the ability no creature with defender can attack; after it, the Gargoyle itself and the others can (CR 702.3b, ruling 2006-05-01)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(g, 0, GARGOYLE.name, 1)).toBe(false);
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(false);
  });

  test('{1}{W}: creatures you control with defender can attack this turn as though they did not have defender', () => {
    const g = board();
    g.act(0).activate(GARGOYLE.name, { ability: 2, pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(g, 0, GARGOYLE.name, 1)).toBe(true);
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(true);
    g.act(0).attack(GARGOYLE.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 37); // the 3/4 deals its power
  });

  test('it affects creatures with defender that arrive after it resolves (ruling 2006-05-01, CR 611.2c), and not creatures without defender', () => {
    const g = scenario()
      .define(GARGOYLE)
      .define(GUARDIAN)
      .seat(0)
      .hand(GUARDIAN.name)
      .library('Plains', { count: 6 })
      .battlefield(GARGOYLE.name, 'Plains', 'Plains', 'Plains', 'Plains', 'Forest', 'Forest')
      .seat(1)
      .library('Plains', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(GARGOYLE.name, { ability: 2, pay: true });
    g.passAll();
    g.act(0).cast(GUARDIAN.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    // The new Guardian is allowed to attack as though it had no defender, but is summoning sick: no haste (CR 609.4 sets aside only the keyword).
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(false);
    expect(canAttack(g, 0, GARGOYLE.name, 1)).toBe(true);
  });

  test('it ends with the turn (CR 514.2)', () => {
    const g = board();
    g.act(0).activate(GARGOYLE.name, { ability: 2, pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(canAttack(g, 0, GARGOYLE.name, 1)).toBe(false);
  });
});

describe('Weathered Sentinels', () => {
  /** Seat 1 attacks `at` with a Grizzly Bears on its turn (if `at` is given); then seat 2 passes, and it is seat 0's declare attackers step. */
  const afterTurns = (at: number | null) => {
    const g = scenario({ seats: 3 })
      .define(SENTINELS)
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(SENTINELS.name)
      .seat(1)
      .library('Forest', { count: 6 })
      .battlefield(BEARS)
      .seat(2)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    if (at !== null) {
      g.advanceTo('declareAttackers', { attack: false });
      g.act(1).attack(BEARS, { player: at });
    }
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(0);
    return g;
  };

  test('it can attack the player who attacked you during their last turn, and not the one who did not (CR 508.6, 702.3b)', () => {
    const g = afterTurns(0);
    expect(canAttack(g, 0, SENTINELS.name, 1)).toBe(true);
    expect(canAttack(g, 0, SENTINELS.name, 2)).toBe(false);
  });

  test('a player who attacked somebody else is not one it can attack', () => {
    const g = afterTurns(2);
    expect(canAttack(g, 0, SENTINELS.name, 1)).toBe(false);
    expect(canAttack(g, 0, SENTINELS.name, 2)).toBe(false);
  });

  test('when nobody attacked you it can not attack at all', () => {
    const g = afterTurns(null);
    expect(canAttack(g, 0, SENTINELS.name, 1)).toBe(false);
    expect(canAttack(g, 0, SENTINELS.name, 2)).toBe(false);
  });

  test('whenever it attacks it gets +3/+3 and gains indestructible until end of turn, and it deals its new power', () => {
    const g = afterTurns(0);
    g.act(0).attack(SENTINELS.name, { player: 1 });
    g.passAll(); // the attack trigger resolves
    g.expect.pt(SENTINELS.name, 5, 8);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 35);
  });
});

describe('Walking Bulwark', () => {
  const board = (fresh: boolean) =>
    scenario()
      .define(BULWARK)
      .define(GUARDIAN)
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(BULWARK.name, 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield(GUARDIAN.name, { fresh })
      .seat(1)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();

  test('without the activation a Guardian that entered this turn can not attack (CR 702.3b, 302.6)', () => {
    const g = board(true);
    g.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(false);
  });

  test('{2}: the target with defender gains haste, can attack and assigns its toughness: a Guardian that entered this turn attacks for 3 (CR 702.10, 609.4, 510.1a)', () => {
    const g = board(true);
    g.act(0).activate(BULWARK.name, { targets: [GUARDIAN.name], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    expect(canAttack(g, 0, GUARDIAN.name, 1)).toBe(true);
    g.act(0).attack(GUARDIAN.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 37);
    // It changes only the damage assigned (ruling 2022-09-09): the Guardian is still a 0/3.
    g.expect.pt(GUARDIAN.name, 0, 3);
  });

  test('Walking Bulwark can target itself: a 0/3 with defender that attacks for 3', () => {
    const g = board(false);
    g.act(0).activate(BULWARK.name, { targets: [BULWARK.name], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BULWARK.name);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 37);
  });

  test('Activate only as a sorcery: it can not be activated in the combat phase (CR 602.5d)', () => {
    const g = board(true);
    g.expect.legal(0, { activate: BULWARK.name });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.illegal(0, { activate: BULWARK.name });
  });

  test('with three seats the creature attacks the chosen opponent', () => {
    const g = scenario({ seats: 3 })
      .define(BULWARK)
      .seat(0)
      .library('Forest', { count: 6 })
      .battlefield(BULWARK.name, 'Forest', 'Forest')
      .seat(1)
      .library('Forest', { count: 6 })
      .seat(2)
      .library('Forest', { count: 6 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(BULWARK.name, { targets: [BULWARK.name], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BULWARK.name, { player: 2 });
    g.advanceTo('postcombatMain');
    g.expect.life(2, 37);
    g.expect.life(1, 40);
  });
});
