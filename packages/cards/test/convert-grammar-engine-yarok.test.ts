// Yarok, the Desecrated: "Deathtouch, lifelink / If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."
// (CR 603.2d, 603.6a), run as written through the grammar and played through applyAction. The cards are SYNTHETIC; the wording is that of the real card, taken from the card data
// the deck support workflow fetched from Scryfall.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const YAROK = parsed(
  'SYNTHETIC Parsed Yarok',
  'Legendary Creature — Elemental Horror',
  'Deathtouch, lifelink\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
  { manaCost: '{2}{B}{G}{U}', colors: ['B', 'G', 'U'], power: '3', toughness: '5' },
);
const ENTERER = parsed(
  'SYNTHETIC Parsed Enterer',
  'Creature — Human',
  'When ~ enters, you gain 1 life.',
  { manaCost: '{1}', power: '1', toughness: '1' },
);

describe('Yarok, the Desecrated', () => {
  test('a creature entering triggers its own enters ability twice', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(YAROK)
      .define(ENTERER)
      .battlefield(YAROK.name)
      .battlefield('Island')
      .hand(ENTERER.name)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ENTERER.name, { pay: true });
    g.passAll();
    g.expect.invariants();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('without it the enters ability triggers once', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(ENTERER)
      .battlefield('Island')
      .hand(ENTERER.name)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ENTERER.name, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(21);
  });
});
