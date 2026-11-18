// Issue 89 (Silverquill Influence), group 7 (D-644): "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card" (Sram, Senior Edificer): a cast trigger whose filter is a
// choice of three subtypes. Pins: CR 601.2i and 603.2 (a spell was cast: the ability triggers once for it), CR 205.3 (the subtypes of the spell's card are what it matches), CR 112.1
// (only a spell: a permanent of that kind that enters another way does not trigger it) and "you" (an opponent's spell does not).
// Cards: the SYNTHETIC "Spell Watcher" of this file, SYNTHETIC Might Aura, Blade and Rattle Wagon, the real Grizzly Bears and the basic lands.
import { describe, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Spell Watcher';
const AURA = 'SYNTHETIC Might Aura';
const EQUIPMENT = 'SYNTHETIC Blade';
const VEHICLE = 'SYNTHETIC Rattle Wagon';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2'],
  types: ['creature'],
  subtypes: ['Human', 'Wizard'],
  colors: [],
  colorIdentity: [],
  power: 2,
  toughness: 2,
  oracleText: 'Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: {
          stackKind: 'spell',
          anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }, { subtypes: ['Vehicle'] }],
        },
        by: 'you',
      },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

function board(hand: readonly string[]): ScenarioGame {
  return scenario()
    .seat(0)
    .define(watcher)
    .hand(...hand)
    .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', WATCHER, BEARS)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
}

describe('"Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card."', () => {
  test('an Aura spell draws a card', () => {
    const g = board([AURA]);
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('an Equipment spell draws a card', () => {
    const g = board([EQUIPMENT]);
    g.act(0).cast(EQUIPMENT, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('a Vehicle spell draws a card', () => {
    const g = board([VEHICLE]);
    g.act(0).cast(VEHICLE, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('another kind of spell does not: a creature spell', () => {
    const g = board(['Llanowar Elves']);
    g.act(0).cast('Llanowar Elves', { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('each spell triggers once: two spells, two cards', () => {
    const g = board([EQUIPMENT, VEHICLE]);
    g.act(0).cast(EQUIPMENT, { pay: true });
    g.passAll();
    g.act(0).cast(VEHICLE, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test("an opponent's spell does not", () => {
    const g = scenario()
      .seat(0)
      .define(watcher)
      .battlefield(WATCHER)
      .library(...LIBRARY)
      .seat(1)
      .hand(VEHICLE)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(VEHICLE, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
  });
});
