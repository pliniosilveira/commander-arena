// Scenario 23 (SPEC 12): commander damage. 21 combat damage from one commander, spread across turns
// and across trips to the command zone, makes a player lose even with life remaining. Damage from
// two different commanders doesn't add together.
// Pins: CR 903.10a (Commander) and CR 704.6c (State-Based Actions): a player who has been dealt 21
// or more combat damage by the same commander over the course of the game loses the game.
// Only combat damage counts (CR 903.10a says "combat damage"): damage from a spell does not.
// CR 903.9a and 903.9b: a commander that dies or is bounced may return to the command zone, and
// CR 400.7: it is a new object each time, so the damage count belongs to the commander card (the
// "commander" flag in the DSL), not to the object.
// CR 510.2 and 702.4b: each combat damage step deals damage, so a double-striking commander adds the
// damage of both steps.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const YARGLE = 'Yargle, Glutton of Urborg'; // 9/3
const ISAMARU = 'Isamaru, Hound of Konda'; // 2/2

type G = ReturnType<ReturnType<typeof scenario>['build']>;

/** Seat 0 attacks with `name` in the declare attackers step of `turn` and plays through combat. */
function hit(g: G, name: string, turn: number) {
  g.advanceTo('declareAttackers', { turn });
  g.act(0).attack(name);
  g.advanceTo('postcombatMain');
}

describe('CR 903.10a: 21 combat damage from one commander over the game', () => {
  test('9 + 9 + 9 across three turns and two trips to the command zone: the player loses at 27, with 13 life left', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .battlefield('Swamp', { count: 12 })
      .battlefield('Island')
      .hand('Murder', 'Unsummon')
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

    // Turn 3, first hit.
    hit(g, YARGLE, 3);
    g.expect.life(1, 31);
    g.expect.commanderDamage(1, YARGLE, 9);

    // First trip: Murder on our own commander (CR 903.9a), then cast it from the command zone.
    g.act(0).cast('Murder', { targets: [YARGLE], pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(YARGLE, 'command', { seat: 0 });
    g.act(0).cast(YARGLE, { pay: true });
    g.passAll();
    g.expect.zone(YARGLE, 'battlefield', { seat: 0 });
    // A new object, but the damage count did not move or reset (CR 400.7: it belongs to the card).
    g.expect.commanderDamage(1, YARGLE, 9);

    // Turn 5, second hit: 18, not enough.
    hit(g, YARGLE, 5);
    g.expect.life(1, 22);
    g.expect.commanderDamage(1, YARGLE, 18);
    g.expect.hasLost(1, false);

    // Second trip: bounce it (CR 903.9b), return it to the command zone and cast it again.
    g.act(0).cast('Unsummon', { targets: [YARGLE], pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.act(0).cast(YARGLE, { pay: true });
    g.passAll();
    g.expect.commanderDamage(1, YARGLE, 18);
    g.expect.hasLost(1, false);

    // Turn 7, third hit: 27 combat damage from the same commander. The player has 13 life left.
    g.advanceTo('declareAttackers', { turn: 7 });
    g.act(0).attack(YARGLE);
    g.advanceTo('combatDamage');
    g.expect.commanderDamage(1, YARGLE, 27);
    g.expect.life(1, 13);
    g.expect.hasLost(1);
    g.expect.gameOver({ win: 0 });
    g.expect.eventLog([{ kind: 'playerLost', seat: 1, reason: 'commanderDamage' }]);
    // The damage is stored once, under the commander card.
    expect(Object.keys(g.state.commanderDamage)).toHaveLength(1);
  });

  test('exactly 21 loses (12 already taken, then a hit of 9), with 19 life left', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .seat(1)
      .life(28)
      .commanderDamageTaken(YARGLE, 12)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(YARGLE);
    g.advanceTo('combatDamage');
    g.expect.life(1, 19);
    g.expect.commanderDamage(1, YARGLE, 21);
    g.expect.gameOver({ win: 0 });
  });

  test('20 does not lose (11 already taken, then 9), and the player has 31 life left', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .library('Island', { count: 3 })
      .seat(1)
      .library('Island', { count: 3 })
      .commanderDamageTaken(YARGLE, 11)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(YARGLE);
    g.advanceTo('postcombatMain');
    g.expect.commanderDamage(1, YARGLE, 20);
    g.expect.hasLost(1, false);
    g.expect.life(1, 31);
  });

  test('the loss is a state-based action: it happens before anyone gets priority after damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .seat(1)
      .commanderDamageTaken(YARGLE, 20)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(YARGLE);
    g.advanceTo('combatDamage');
    g.expect.gameOver({ win: 0 });
    expect(g.state.pending).toBeNull();
  });

  test('damage already counted loses at the next check even without more damage this turn', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .seat(1)
      .commanderDamageTaken(YARGLE, 21)
      .build({ settle: true });
    g.expect.gameOver({ win: 0 });
  });
});

describe('CR 903.10a: only damage from the same commander adds up', () => {
  function twoCommanders(yargleTaken: number, isamaruTaken: number) {
    return scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .battlefield(ISAMARU, { commander: true })
      .library('Island', { count: 3 })
      .seat(1)
      .library('Island', { count: 3 })
      .commanderDamageTaken(YARGLE, yargleTaken)
      .commanderDamageTaken(ISAMARU, isamaruTaken)
      .at('precombatMain', { active: 0 })
      .build({ settle: true });
  }

  test('20 from one commander and 10 from another is 30 in all, and nobody loses', () => {
    const g = twoCommanders(20, 10);
    g.expect.hasLost(1, false);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ISAMARU); // 10 + 2 = 12 from Isamaru, still 20 from Yargle
    g.advanceTo('postcombatMain');
    g.expect.commanderDamage(1, ISAMARU, 12);
    g.expect.commanderDamage(1, YARGLE, 20);
    g.expect.hasLost(1, false);
    g.expect.life(1, 38);
  });

  test('both commanders attacking together: each is counted on its own, and the one reaching 21 loses', () => {
    const g = twoCommanders(12, 12);
    g.advanceTo('declareAttackers');
    g.act(0).attack([YARGLE, ISAMARU]);
    g.advanceTo('combatDamage');
    // Yargle: 12 + 9 = 21. Isamaru: 12 + 2 = 14. The sum, 35, is not what matters.
    g.expect.commanderDamage(1, YARGLE, 21);
    g.expect.commanderDamage(1, ISAMARU, 14);
    g.expect.gameOver({ win: 0 });
  });

  test('two commanders each below 21 with a sum above 21 do not lose together', () => {
    const g = twoCommanders(15, 15);
    g.advanceTo('declareAttackers');
    g.act(0).attack(ISAMARU);
    g.advanceTo('postcombatMain');
    g.expect.commanderDamage(1, ISAMARU, 17);
    g.expect.hasLost(1, false);
  });

  test('damage is counted per victim: a commander hitting seat 1 does not mark seat 0', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(YARGLE);
    g.advanceTo('endOfCombat');
    g.expect.commanderDamage(1, YARGLE, 9);
    g.expect.commanderDamage(0, YARGLE, 0);
  });

  test('a commander of the other seat hitting seat 0 is tracked under seat 0', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 3 })
      .seat(1)
      .battlefield(ISAMARU, { commander: true })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(ISAMARU);
    g.advanceTo('endOfCombat');
    g.expect.commanderDamage(0, ISAMARU, 2);
    g.expect.commanderDamage(1, ISAMARU, 0);
  });
});

describe('CR 903.10a: only combat damage dealt to a player by a commander counts', () => {
  test('damage from a commander spell does not count, even when it would make the total 21 or more', () => {
    // Lightning Bolt as a commander: 20 combat damage already counted (an impossible past for a
    // Bolt, but the rule only looks at the count), then the Bolt itself hits for 3.
    const g = scenario()
      .seat(0)
      .commander('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .commanderDamageTaken('Lightning Bolt', 20)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.commanderDamage(1, 'Lightning Bolt', 20);
    g.expect.hasLost(1, false);
    g.expect.noEvent({ kind: 'damageDealt', combat: true });
  });

  test('combat damage dealt to a creature or a planeswalker is not commander damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE, { commander: true })
      .battlefield(ISAMARU, { commander: true })
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: YARGLE, target: 'SYNTHETIC Vanilla Planeswalker' },
      { attacker: ISAMARU, target: { player: 1 } },
    ]);
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.advanceTo('endOfCombat');
    g.expect.commanderDamage(1, YARGLE, 0);
    g.expect.commanderDamage(1, ISAMARU, 2);
  });

  test('damage from a creature that is not a commander is not tracked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(YARGLE)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(YARGLE);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 31);
    expect(g.state.commanderDamage).toEqual({});
  });

  test('a commander that deals combat damage twice in one combat counts both (double strike, lifelink)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Double Strike Lifelink 3/3', { commander: true })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Double Strike Lifelink 3/3');
    g.advanceTo('firstStrikeDamage');
    g.expect.commanderDamage(1, 'SYNTHETIC Double Strike Lifelink 3/3', 3);
    g.advanceTo('combatDamage');
    g.expect.commanderDamage(1, 'SYNTHETIC Double Strike Lifelink 3/3', 6);
    g.expect.life(1, 34);
    g.expect.life(0, 26);
  });

  test('a lifelink commander gains life and the same damage counts as commander damage', () => {
    const g = scenario()
      .seat(0)
      .life(10)
      .battlefield('SYNTHETIC Double Strike Lifelink 3/3', { commander: true })
      .seat(1)
      .commanderDamageTaken('SYNTHETIC Double Strike Lifelink 3/3', 18)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Double Strike Lifelink 3/3');
    g.advanceTo('firstStrikeDamage');
    // 18 + 3 = 21 after the first-strike step: the player loses before the regular step.
    g.expect.gameOver({ win: 0 });
    g.expect.life(0, 13);
    g.expect.commanderDamage(1, 'SYNTHETIC Double Strike Lifelink 3/3', 21);
  });
});
