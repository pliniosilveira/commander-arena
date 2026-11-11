/**
 * SYNTHETIC CARDS FOR SNOW MANA AND A SEARCH FOR ONE OF SEVERAL KINDS OF CARD. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-256 (the Bruna deck): a snow basic land (CR 205.4g, 107.4h) and "Search your library for a snow permanent card, a
 * legendary card, or a Saga card, reveal it, put it into your hand, then shuffle. You gain 1 life for each {S} spent to cast this spell." (the wording of
 * a real card, the name replaced). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const PERMANENT_TYPES = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
] as const;

export const SYNTHETIC_SNOW_LIST: readonly CardDefinition[] = [
  // A snow basic land: "{T}: Add {W}."
  singleFace({
    name: 'SYNTHETIC Snow Plains',
    manaCost: null,
    supertypes: ['basic', 'snow'],
    types: ['land'],
    subtypes: ['Plains'],
    colors: [],
    colorIdentity: ['W'],
    oracleText: '({T}: Add {W}.)',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['W'] },
      },
    ],
  }),
  // "Search your library for a snow permanent card, a legendary card, or a Saga card, reveal it, put it into your hand, then shuffle.
  //  You gain 1 life for each {S} spent to cast this spell."
  singleFace({
    name: 'SYNTHETIC Frozen Quest',
    manaCost: ['2', 'W'],
    supertypes: ['snow'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Search your library for a snow permanent card, a legendary card, or a Saga card, reveal it, put it into your hand, then shuffle. You gain 1 life for each {S} spent to cast this spell.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'search',
            player: { kind: 'you' },
            filter: {
              anyOf: [
                { supertypes: ['snow'], anyOf: PERMANENT_TYPES.map((t) => ({ types: [t] })) },
                { supertypes: ['legendary'] },
                { subtypes: ['Saga'] },
              ],
            },
            max: 1,
            destinations: [{ zone: 'hand', count: 1 }],
            reveal: true,
            shuffle: true,
          },
          {
            kind: 'gainLife',
            player: { kind: 'you' },
            amount: { kind: 'manaSpent', snow: true },
          },
        ],
      },
    },
  }),
  // A snow permanent that is not a land, to be found.
  singleFace({
    name: 'SYNTHETIC Snow Sprite',
    manaCost: ['W'],
    supertypes: ['snow'],
    types: ['creature'],
    subtypes: ['Faerie'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  // A snow instant: a snow card that is no permanent card (CR 205.4g: only a permanent is a snow permanent).
  singleFace({
    name: 'SYNTHETIC Snow Flurry',
    manaCost: ['U'],
    supertypes: ['snow'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A legendary card that is not snow and no Saga.
  singleFace({
    name: 'SYNTHETIC Legend of Frost',
    manaCost: ['1', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
];
