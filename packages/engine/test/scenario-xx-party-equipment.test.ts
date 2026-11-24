// An Equipment that gives each keyword only while its controller controls a creature of a type, and prevents all damage to the equipped creature while its controller has a
// full party. Pins: CR 613.1f and 611.3a (keywords granted in layer 6 while a condition holds, read all the time), CR 700.8 and 700.8c (the party, a full party is four),
// CR 615.1 and 615.6 (prevention of damage: it is never dealt), CR 303.4 and 301.5 (the effect is about the permanent the Equipment is attached to). The prevention is an
// effect of the Equipment, not an ability of the creature (CR 613.1f: a later "loses all abilities" would not end it). The card is SYNTHETIC (src/cards/fixtures/synthetic-party.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const AEGIS = 'SYNTHETIC Party Aegis';
const CLERIC = 'SYNTHETIC Party Cleric';
const ROGUE = 'SYNTHETIC Party Rogue';
const WARRIOR = 'SYNTHETIC Party Warrior';
const WIZARD = 'SYNTHETIC Party Wizard';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test(AEGIS, () => {
    expect(validateCard(syntheticCard(AEGIS))).toEqual([]);
  });
});

/** Seat 0 has the Equipment on `host` (a Grizzly Bears) and the given creatures; seat 1 has a Bolt and a Mountain. */
const game = (party: readonly string[], seats = 2) => {
  let b = scenario({ seats })
    .seat(0)
    .library(...LIBRARY)
    .battlefield(BEARS, { label: 'host' })
    .battlefield(AEGIS, { attachedTo: 'host' })
    .battlefield(...party);
  for (let s = 1; s < seats; s++) {
    b = b
      .seat(s as 1 | 2 | 3)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain');
  }
  return b.at('precombatMain', { active: 1 }).build();
};

describe('keywords by creature type (CR 613.1f, 611.3a)', () => {
  test.each([
    [CLERIC, 'lifelink'],
    [ROGUE, 'deathtouch'],
    [WARRIOR, 'haste'],
    [WIZARD, 'flying'],
  ])('a %s gives only %s', (member, keyword) => {
    game([member]).expect.derived('host', { keywords: [keyword] });
  });

  test('with no creature of the four types the equipped creature has none', () => {
    game([]).expect.derived('host', { keywords: [] });
  });

  test('with all four it has all four', () => {
    game([CLERIC, ROGUE, WARRIOR, WIZARD]).expect.derived('host', {
      keywords: ['lifelink', 'deathtouch', 'haste', 'flying'],
    });
  });

  test('the type is read for the controller of the Equipment, not for an opponent', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'host' })
      .battlefield(AEGIS, { attachedTo: 'host' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(CLERIC)
      .build();
    g.expect.derived('host', { keywords: [] });
  });
});

describe('prevention while its controller has a full party (CR 615.1, 615.6, 700.8c)', () => {
  const bolt = (g: ReturnType<typeof game>) => {
    g.act(1).cast(`${BOLT}[0]`, { targets: ['host'], pay: true });
    g.passAll();
  };

  test('with a full party the damage is not dealt', () => {
    const g = game([CLERIC, ROGUE, WARRIOR, WIZARD]);
    bolt(g);
    g.expect.damage('host', 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with three of the four it is dealt and the creature dies', () => {
    const g = game([CLERIC, ROGUE, WARRIOR]);
    bolt(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('it stops when a party member leaves: the next damage is dealt', () => {
    const g = game([CLERIC, ROGUE, WARRIOR, WIZARD]);
    bolt(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(1).cast(`${BOLT}[0]`, { targets: [WIZARD], pay: true });
    g.passAll();
    g.expect.zone(WIZARD, 'graveyard', { seat: 0 });
  });

  test('an unequipped creature is not protected', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'host' })
      .battlefield(CLERIC, ROGUE, WARRIOR, WIZARD)
      .battlefield(AEGIS)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(`${BOLT}[0]`, { targets: ['host'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('in a game of three seats, the party of the Equipment controller counts, not the opponents', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'host' })
      .battlefield(AEGIS, { attachedTo: 'host' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', CLERIC, ROGUE, WARRIOR, WIZARD)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(`${BOLT}[0]`, { targets: ['host'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
