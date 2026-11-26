// "Each creature card in your graveyard that's a Cleric, Rogue, Warrior, and/or Wizard has unearth {1}{B}." (a static ability that gives Unearth to cards of a graveyard).
// Pins: CR 702.84a (Unearth), CR 613.1f (a granted keyword is a layer 6 effect), CR 604.3, CR 113.6b (it works from the graveyard).
// Cards: the SYNTHETIC "Unearthing Lord", "Graveyard Cleric" and "Graveyard Goblin" of this file, the basic lands.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const LORD = 'SYNTHETIC Unearthing Lord';
const CLERIC = 'SYNTHETIC Graveyard Cleric';
const GOBLIN = 'SYNTHETIC Graveyard Goblin';

const creature = (name: string, subtype: string) =>
  singleFaceCard({
    name,
    manaCost: ['B'],
    types: ['creature'],
    subtypes: [subtype],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [],
  });

const lord = singleFaceCard({
  name: LORD,
  manaCost: ['3', 'B'],
  types: ['creature'],
  subtypes: ['Tiefling'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText:
    'Each creature card in your graveyard that is a Cleric or a Rogue has unearth {1}{B}.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'grantUnearthToGraveyardCards',
        what: {
          types: ['creature'],
          anyOf: [{ subtypes: ['Cleric'] }, { subtypes: ['Rogue'] }],
        },
        cost: [{ kind: 'mana', symbols: ['1', 'B'] }],
      },
    },
  ],
});

const start = (withLord = true) =>
  scenario()
    .seat(0)
    .define(lord)
    .define(creature(CLERIC, 'Cleric'))
    .define(creature(GOBLIN, 'Goblin'))
    .battlefield(...(withLord ? [LORD] : []), 'Swamp', 'Swamp', 'Swamp')
    .graveyard(CLERIC, GOBLIN)
    .library('Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('CR 702.84a with CR 613.1f: a permanent that gives Unearth to graveyard cards', () => {
  test('a card of the listed creature types can be unearthed for the cost the permanent states', () => {
    const g = start();
    g.act(0).activate(CLERIC, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(CLERIC, 'battlefield', { seat: 0 });
    g.expect.derived(CLERIC, { keywords: ['haste'] });
    g.expect.invariants();
  });

  test('a card of another creature type has no such ability', () => {
    expect(() => start().act(0).activate(GOBLIN, { ability: 1, pay: true })).toThrow();
  });

  test('without the permanent the card has no such ability, and the grant ends when it leaves', () => {
    expect(() => start(false).act(0).activate(CLERIC, { ability: 1, pay: true })).toThrow();
  });
});
