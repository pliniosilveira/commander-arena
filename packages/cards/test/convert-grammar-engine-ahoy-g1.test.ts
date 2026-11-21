// Ahoy Mateys deck, group 1: Francisco, Fowl Marauder and Malcolm, Keen-Eyed Navigator, read from their real Oracle text and run by the engine.
// "Whenever one or more Pirates you control deal damage to a player, Francisco explores."
// "Whenever one or more Pirates you control deal damage to your opponents, you create a Treasure token for each opponent dealt damage."
// Pins: CR 603.2c (one trigger for the whole damage event of a group of sources), CR 120.2 (damage of any kind: combat or not), CR 120.8 and 603.2g (damage of 0 or entirely prevented is not
// dealt and triggers nothing), CR 701.44 (explore), CR 111.10a-style predefined Treasure tokens are the engine's own. The CR text was not available here: the numbers are those the
// engine's comments cite. "To a player" is read once for each player dealt damage (as the existing combat batch trigger is); "to your opponents" once for the event, however many opponents.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const FRANCISCO = real('Francisco, Fowl Marauder');
const MALCOLM = real('Malcolm, Keen-Eyed Navigator');
const BEARS = 'Grizzly Bears';
const PIRATE = parsed('SYNTHETIC Test Pirate', 'Creature — Human Pirate', '', {
  manaCost: '{1}{U}',
  power: '2',
  toughness: '2',
  colors: ['U'],
});
const PINGER = parsed(
  'SYNTHETIC Pirate Pinger',
  'Creature — Human Pirate',
  '{T}: ~ deals 1 damage to target player.',
  { manaCost: '{1}{R}', power: '1', toughness: '1', colors: ['R'] },
);

const treasures = (g: ScenarioGame, seat: 0 | 1 | 2 = 0) =>
  g.find({ name: 'Treasure', zone: 'battlefield', seat }).length;
const hand = (g: ScenarioGame, name: string, seat: 0 | 1 | 2 = 0) =>
  g.find({ name, zone: 'hand', seat }).length;

describe('the parsed triggers', () => {
  test('Francisco: damage of any kind by a group of Pirates, once for each player damaged', () => {
    expect(FRANCISCO.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'damageBatch', what: { subtypes: ['Pirate'] }, to: 'player' },
      effect: { kind: 'explore', objects: { kind: 'this' } },
    });
  });

  test('Malcolm: once for the event, a Treasure for each opponent dealt damage', () => {
    expect(MALCOLM.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'damageBatch', what: { subtypes: ['Pirate'] }, to: 'opponents' },
      effect: { kind: 'createToken', count: { kind: 'triggerDamagedPlayerCount' } },
    });
  });
});

describe('Malcolm, Keen-Eyed Navigator', () => {
  test('a Pirate that deals combat damage to the opponent: one Treasure (CR 603.2c, 120.2a)', () => {
    const g = scenario()
      .define(MALCOLM)
      .seat(0)
      .battlefield(MALCOLM.name)
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [MALCOLM.name], until: 'combatDamage' });
    g.expect.stack([`${MALCOLM.name} (ability)`]);
    g.passAll();
    expect(treasures(g)).toBe(1);
    g.expect.invariants();
  });

  test('a creature that is no Pirate: nothing', () => {
    const g = scenario()
      .define(MALCOLM)
      .seat(0)
      .battlefield(MALCOLM.name)
      .battlefield(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack([]);
    expect(treasures(g)).toBe(0);
  });

  test('two Pirates damage two different opponents at once: one trigger, two Treasures (CR 603.2c)', () => {
    const g = scenario({ seats: 3 })
      .define(MALCOLM)
      .define(PIRATE)
      .seat(0)
      .battlefield(MALCOLM.name)
      .battlefield(PIRATE.name)
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [
        { attacker: MALCOLM.name, target: { player: 1 } },
        { attacker: PIRATE.name, target: { player: 2 } },
      ],
      until: 'combatDamage',
    });
    g.expect.stack([`${MALCOLM.name} (ability)`]);
    g.passAll();
    expect(treasures(g)).toBe(2);
  });

  test('two Pirates damage the same opponent: one trigger, one Treasure', () => {
    const g = scenario()
      .define(MALCOLM)
      .define(PIRATE)
      .seat(0)
      .battlefield(MALCOLM.name)
      .battlefield(PIRATE.name)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [MALCOLM.name, PIRATE.name], until: 'combatDamage' });
    g.passAll();
    expect(treasures(g)).toBe(1);
  });

  test('damage that is not combat damage counts too (CR 120.2)', () => {
    const g = scenario()
      .define(MALCOLM)
      .define(PINGER)
      .seat(0)
      .battlefield(MALCOLM.name)
      .battlefield(PINGER.name, { label: 'pinger' })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('pinger', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(treasures(g)).toBe(1);
  });
});

describe('Francisco, Fowl Marauder', () => {
  test('a Pirate deals damage to a player: Francisco explores; a land goes to the hand (CR 701.44a)', () => {
    const g = scenario()
      .define(FRANCISCO)
      .define(PIRATE)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(FRANCISCO.name)
      .battlefield(PIRATE.name)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [PIRATE.name], until: 'combatDamage' });
    g.expect.stack([`${FRANCISCO.name} (ability)`]);
    g.passAll();
    expect(hand(g, 'Island')).toBe(1);
    g.expect.invariants();
  });

  test('Francisco itself deals 0 damage: no damage is dealt, nothing triggers (CR 120.8, 603.2g)', () => {
    const g = scenario()
      .define(FRANCISCO)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(FRANCISCO.name)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [FRANCISCO.name], until: 'combatDamage' });
    g.expect.stack([]);
  });

  test('noncombat damage by a Pirate triggers it too (CR 120.2)', () => {
    const g = scenario()
      .define(FRANCISCO)
      .define(PINGER)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(FRANCISCO.name)
      .battlefield(PINGER.name, { label: 'pinger' })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('pinger', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(hand(g, 'Island')).toBe(1);
  });

  test('a creature that is no Pirate: nothing', () => {
    const g = scenario()
      .define(FRANCISCO)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(FRANCISCO.name)
      .battlefield(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack([]);
  });
});
