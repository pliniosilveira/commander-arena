// Ureni of the Unwritten: "Whenever ~ enters or attacks, look at the top eight cards of your library. You may put a Dragon creature card from among them onto the battlefield. Put the rest
// on the bottom of your library in a random order."
// Pins: CR 401.2 (look at the top cards), CR 401.4 (the rest go to the bottom in a random order).
// Cards: the SYNTHETIC Dragon creatures of this file, the real Grizzly Bears and Plains.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const HOST = 'SYNTHETIC Dragon Seeker';
const DRAGON = 'SYNTHETIC Small Dragon';
const BEARS = 'Grizzly Bears';
const LIBRARY = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'];

const host = singleFaceCard({
  name: HOST,
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Spirit', 'Dragon'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 2,
  oracleText: 'Whenever ~ attacks, ...',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'lookAtTop',
        count: 8,
        take: { filter: { subtypes: ['Dragon'], types: ['creature'] }, max: 1, to: 'battlefield' },
        rest: 'bottomRandom',
      },
    },
  ],
});

const dragon = singleFaceCard({
  name: DRAGON,
  manaCost: ['R'],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 1,
  toughness: 1,
  oracleText: '',
  abilities: [],
});

const attack = (top: readonly string[]) => {
  const g = scenario()
    .seat(0)
    .define(host)
    .define(dragon)
    .library(...top, ...LIBRARY)
    .battlefield(HOST)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([{ attacker: HOST, target: { player: 1 } }]);
  g.passAll();
  return g;
};

describe('"look at the top eight cards ... put a Dragon creature card from among them onto the battlefield"', () => {
  test('a Dragon creature card among them may be put onto the battlefield', () => {
    const g = attack([BEARS, DRAGON, 'Plains']);
    g.act(0).chooseCards(DRAGON);
    g.expect.zone(DRAGON, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });

  test('declining leaves every card in the library', () => {
    const g = attack([BEARS, DRAGON, 'Plains']);
    g.act(0).chooseCards();
    g.expect.zone(DRAGON, 'library', { seat: 0 });
  });

  test('with no Dragon among them nothing is put onto the battlefield', () => {
    const g = attack([BEARS, 'Plains']);
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.zone(BEARS, 'library', { seat: 0 });
  });
});
