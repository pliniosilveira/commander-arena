// Ahoy Mateys deck, group 1b: Breeches, Brazen Plunderer and Ramirez DePietro, Pillager, read from their real Oracle text and run by the engine.
// "Whenever one or more Pirates you control deal damage to your opponents, exile the top card of each of those opponents' libraries. You may play those cards this turn, and you may spend mana as
// though it were mana of any color to cast those spells."
// "Whenever one or more Pirates you control deal combat damage to a player, exile the top card of that player's library. You may cast that card for as long as it remains exiled."
// Pins (the CR text was not available here: the numbers are those the repository's own comments cite): CR 603.2c (one trigger for the whole damage event of a group of sources, so one
// exile of each opponent damaged), CR 120.2 (damage of any kind), CR 701.13 (exile), CR 406.3 and 601.2 (casting a card from exile), CR 305.1 (playing a land), CR 609.4b (mana as though of any
// color), CR 611.2a (how long a permission lasts), CR 400.7 (a card that changes zone is a new object).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BREECHES = real('Breeches, Brazen Plunderer');
const RAMIREZ = real('Ramirez DePietro, Pillager');
const BEARS = 'Grizzly Bears'; // {1}{G}
const BOLT = 'Lightning Bolt';
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
const exiledOf = (name: string, seat: 0 | 1 | 2) => ({ name, zone: 'exile' as const, seat });
const FILLER = Array.from({ length: 6 }, () => 'Plains');

describe('every card is valid', () => {
  test.each([BREECHES, RAMIREZ] as readonly CardDefinition[])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('the parsed abilities', () => {
  test('Breeches: the top card of each opponent damaged, then play them this turn with mana of any color', () => {
    expect(BREECHES.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'damageBatch', what: { subtypes: ['Pirate'] }, to: 'opponents' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', from: { kind: 'triggerDamagedPlayers' } },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn', anyManaColor: true },
        ],
      },
    });
  });

  test('Ramirez: the top card of that player, cast for as long as it remains exiled', () => {
    expect(RAMIREZ.faces[0]?.abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'combatDamageBatch', what: { subtypes: ['Pirate'] } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', from: { kind: 'triggerPlayer' } },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'whileExiled', castOnly: true },
        ],
      },
    });
  });
});

describe('Breeches, Brazen Plunderer', () => {
  /** Seat 0 has Breeches and a second Pirate and two Mountains; each opponent has a different card on top. Both Pirates attack, one each; up to the trigger resolved, in the second main phase. */
  const hit = () => {
    const g = scenario({ seats: 3 })
      .define(BREECHES)
      .define(PIRATE)
      .seat(0)
      .battlefield(BREECHES.name)
      .battlefield(PIRATE.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .library(BEARS, ...FILLER)
      .seat(2)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [
        { attacker: BREECHES.name, target: { player: 1 } },
        { attacker: PIRATE.name, target: { player: 2 } },
      ],
      until: 'combatDamage',
    });
    g.expect.stack([`${BREECHES.name} (ability)`]);
    g.passAll();
    return g;
  };

  test('two opponents dealt damage by two Pirates: one trigger exiles the top card of each library (CR 603.2c, 701.13)', () => {
    const g = hit();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 2 });
    expect(g.state.seats[1]?.library.length).toBe(6);
    expect(g.state.seats[2]?.library.length).toBe(6);
    g.expect.invariants();
  });

  test('a spell exiled this way is cast this turn with mana of any color (CR 601.2, 609.4b)', () => {
    const g = hit();
    g.advanceTo('postcombatMain');
    // {1}{G} with two Mountains: only possible when any mana pays for the colored symbol.
    g.act(0).cast(exiledOf(BEARS, 1), { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a land exiled this way is played, not cast (CR 305.1)', () => {
    const g = hit();
    g.advanceTo('postcombatMain');
    g.act(0).playLand(exiledOf('Island', 2));
    g.expect.zone('Island', 'battlefield', { seat: 0 });
  });

  test('the permission ends with the turn (CR 611.2a, 400.7)', () => {
    const g = hit();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.illegal(0, { cast: exiledOf(BEARS, 1) });
  });

  test('the opponents cannot play the cards: the permission is the controller’s', () => {
    const g = hit();
    g.expect.illegal(1, { cast: exiledOf(BEARS, 1) });
  });

  test('only the opponent dealt damage loses a card: the third player is untouched', () => {
    const g = scenario({ seats: 3 })
      .define(BREECHES)
      .seat(0)
      .battlefield(BREECHES.name)
      .seat(1)
      .library(BEARS, ...FILLER)
      .seat(2)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({
      attack: [{ attacker: BREECHES.name, target: { player: 1 } }],
      until: 'combatDamage',
    });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(g.find({ name: 'Island', zone: 'library', seat: 2 })).toHaveLength(1);
  });

  test('damage that is not combat damage triggers it too (CR 120.2)', () => {
    const g = scenario()
      .define(BREECHES)
      .define(PINGER)
      .seat(0)
      .battlefield(BREECHES.name)
      .battlefield(PINGER.name, { label: 'pinger' })
      .seat(1)
      .library(BOLT, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('pinger', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
  });

  test('a creature that is no Pirate: nothing', () => {
    const g = scenario()
      .define(BREECHES)
      .seat(0)
      .battlefield(BREECHES.name)
      .battlefield(BEARS)
      .seat(1)
      .library(BOLT, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack([]);
    g.expect.zone(BOLT, 'library', { seat: 1 });
  });
});

describe('Ramirez DePietro, Pillager', () => {
  /** Seat 0 has Ramirez, which attacks seat 1, and the given lands; seat 1 has the Bears on top. Up to the trigger resolved. */
  const hit = (lands: readonly string[]) => {
    const g = scenario()
      .define(RAMIREZ)
      .seat(0)
      .battlefield(RAMIREZ.name)
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .library(BEARS, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [RAMIREZ.name], until: 'combatDamage' });
    g.expect.stack([`${RAMIREZ.name} (ability)`]);
    g.passAll();
    return g;
  };

  test('exiles the top card of the player dealt combat damage (CR 701.13)', () => {
    const g = hit(['Forest', 'Forest']);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.invariants();
  });

  test('the card can be cast, paying its own cost (CR 601.2)', () => {
    const g = hit(['Forest', 'Forest']);
    g.advanceTo('postcombatMain');
    g.act(0).cast(exiledOf(BEARS, 1), { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('no any-color rider: lands that cannot make green mana cannot cast it', () => {
    const g = hit(['Mountain', 'Mountain']);
    g.advanceTo('postcombatMain');
    g.expect.illegal(0, { cast: exiledOf(BEARS, 1) });
  });

  test('the permission lasts for as long as the card remains exiled: a later turn too (CR 611.2a)', () => {
    const g = hit(['Forest', 'Forest']);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.legal(0, { cast: exiledOf(BEARS, 1) });
  });

  test('a land card is not cast, so it cannot be played with it (CR 305.1)', () => {
    const g = scenario()
      .define(RAMIREZ)
      .seat(0)
      .battlefield(RAMIREZ.name)
      .seat(1)
      .library('Island', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [RAMIREZ.name], until: 'combatDamage' });
    g.passAll();
    g.expect.zone('Island', 'exile', { seat: 1 });
    g.advanceTo('postcombatMain');
    g.expect.illegal(0, { playLand: exiledOf('Island', 1) });
  });

  test('two Pirates deal combat damage to the same player: one trigger, one card (CR 603.2c)', () => {
    const g = scenario()
      .define(RAMIREZ)
      .define(PIRATE)
      .seat(0)
      .battlefield(RAMIREZ.name)
      .battlefield(PIRATE.name)
      .seat(1)
      .library(BEARS, BOLT, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [RAMIREZ.name, PIRATE.name], until: 'combatDamage' });
    g.expect.stack([`${RAMIREZ.name} (ability)`]);
    g.passAll();
    expect(g.state.seats[1]?.library.length).toBe(7);
  });

  test('a creature that is no Pirate: nothing', () => {
    const g = scenario()
      .define(RAMIREZ)
      .seat(0)
      .battlefield(RAMIREZ.name)
      .battlefield(BEARS)
      .seat(1)
      .library(BOLT, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.expect.stack([]);
  });
});
