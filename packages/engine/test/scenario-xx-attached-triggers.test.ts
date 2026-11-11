// "Whenever equipped creature dies / attacks / deals combat damage / leaves the battlefield" and the
// same for "enchanted creature" (D-111): the `attached` trigger subject.
// Pins: CR 301.5a and 303.4b (an Equipment or Aura is attached to a permanent), CR 603.10a and
// 113.7a (a creature that dies is read as it was: the attachment still names it, last-known
// information of the host, until state-based actions unattach it, CR 704.5m, 704.5n), CR 603.2
// (each event triggers), CR 701.3 (attaching again moves it).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const LAST_GIFT = 'SYNTHETIC Last Gift Blade';
const DRUMBEAT = 'SYNTHETIC Drumbeat Blade';
const DOOM_AURA = 'SYNTHETIC Doom Aura';
const TAP_AURA = 'SYNTHETIC Tap Aura';

/** Seat 0 has `blade` attached to its V22 (and an unequipped V33); seat 1 holds Murder. */
function equipped(blade: string, extra: readonly string[] = []) {
  return scenario()
    .seat(0)
    .life(20)
    .battlefield(V22, V33)
    .battlefield(blade, { attachedTo: V22 })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .life(20)
    .hand('Murder', 'Unsummon')
    .battlefield(...extra)
    .pool('BBBU')
    .at('precombatMain', { active: 1 })
    .build();
}

const murder = (g: ReturnType<typeof equipped>, target: string) => {
  g.act(1).cast('Murder', { targets: [target], pay: true });
  g.pass();
  g.pass();
};

describe('whenever equipped creature dies (CR 603.10a)', () => {
  test('triggers when the creature the Equipment is attached to dies', () => {
    const g = equipped(LAST_GIFT);
    g.expect.attached(LAST_GIFT, V22);
    murder(g, V22);
    g.expect.stack([`${LAST_GIFT} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 2);
    // The Equipment stays on the battlefield, unattached once state-based actions ran.
    g.expect.zone(LAST_GIFT, 'battlefield', { seat: 0 });
    g.expect.attached(LAST_GIFT, null);
  });

  test('does not trigger when another creature dies', () => {
    const g = equipped(LAST_GIFT);
    murder(g, V33);
    g.expect.stack([]);
  });

  test('a creature of the opponent that carries your Equipment is "equipped creature" too', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(LAST_GIFT, { attachedTo: V22 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(V22)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    murder(g as ReturnType<typeof equipped>, V22);
    g.expect.stack([`${LAST_GIFT} (ability)`]);
  });

  test('moving the Equipment moves the trigger with it (CR 701.3)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V22, V33)
      .battlefield(LAST_GIFT, { attachedTo: V22 })
      .pool('C')
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .hand('Murder', 'Murder')
      .pool('BBBBBB')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(LAST_GIFT, { targets: [V33], pay: true });
    g.passAll();
    g.expect.attached(LAST_GIFT, V33);
    g.pass(); // seat 0 passes with the stack empty: seat 1 may act
    g.act(1).cast({ name: 'Murder', zone: 'hand', seat: 1, nth: 0 }, { targets: [V22], pay: true });
    g.pass();
    g.pass();
    // The old host is no longer equipped.
    g.expect.stack([]);
    g.pass();
    g.act(1).cast('Murder', { targets: [V33], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${LAST_GIFT} (ability)`]);
  });
});

describe('whenever enchanted creature dies: an Aura (CR 303.4b, 603.10a)', () => {
  test('the Aura sees the creature it enchanted die, and then goes to the graveyard', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V22)
      .battlefield(DOOM_AURA, { attachedTo: V22 })
      .seat(1)
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${DOOM_AURA} (ability)`]);
    // The enchanted creature left, so the Aura is put into the graveyard by a state-based action.
    g.expect.zone(DOOM_AURA, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(0, 22);
  });

  test("an Aura of yours on the opponent's creature triggers when that creature dies", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .seat(1)
      .battlefield(V22)
      .hand('Murder')
      .pool('BBB')
      .seat(0)
      .battlefield(DOOM_AURA, { attachedTo: V22 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${DOOM_AURA} (ability)`]);
  });

  test('"becomes tapped" works on the enchanted creature', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V22)
      .battlefield(TAP_AURA, { attachedTo: V22 })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V22);
    g.expect.stack([`${TAP_AURA} (ability)`]);
  });
});

describe('whenever equipped creature attacks, deals combat damage, leaves the battlefield', () => {
  test('attacks: only the equipped creature, not the other attacker', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V22, V33)
      .battlefield(DRUMBEAT, { attachedTo: V22 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V22, V33]);
    g.expect.stack([`${DRUMBEAT} (ability)`]);
  });

  test('combat damage to a player: the equipped creature draws a card, the other does not', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V22, V33)
      .battlefield(DRUMBEAT, { attachedTo: V22 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V22, V33]);
    g.passAll();
    g.advanceTo('combatDamage');
    // The attack trigger already resolved; two creatures dealt damage, one trigger for the equipped one.
    const abilities = g.state.stack.length;
    expect(abilities).toBe(1);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('leaves the battlefield: bouncing the equipped creature triggers it, once', () => {
    const g = equipped(DRUMBEAT);
    g.act(1).cast('Unsummon', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${DRUMBEAT} (ability)`]);
    g.passAll();
    g.expect.life(0, 23);
  });

  test('legal actions with the trigger on the stack are accepted by the engine', () => {
    const build = () => {
      const g = equipped(DRUMBEAT);
      g.act(1).cast('Unsummon', { targets: [V22], pay: true });
      g.pass();
      g.pass();
      return g;
    };
    for (const action of build().legalActions(1)) {
      expect(build().act(1).try.action(action).ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('determinism: the same game twice gives the same hash', () => {
    const run = () => {
      const g = equipped(DRUMBEAT);
      g.act(1).cast('Unsummon', { targets: [V22], pay: true });
      g.passAll();
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});
