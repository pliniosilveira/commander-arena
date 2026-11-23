/**
 * SYNTHETIC ENERGY CARDS (ISSUE 105). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of {E} as the cost of an activated ability (CR 107.14, 118.3) and of a mana ability (CR 605.3). Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_ENERGY_LIST: readonly CardDefinition[] = [
  // "{T}, Pay {E}: Add one mana of any color."
  singleFace({
    name: 'SYNTHETIC Energy Cell',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}, Pay {E}: Add one mana of any color.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, { kind: 'energy', count: 1 }],
        production: { kind: 'anyColor' },
      },
    ],
  }),
  // "Pay {E}{E}: Draw a card."
  singleFace({
    name: 'SYNTHETIC Energy Scribe',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Pay {E}{E}: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'energy', count: 2 }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "{T}: You may pay any amount of {E}. If you do, draw that many cards."
  singleFace({
    name: 'SYNTHETIC Energy Bellows',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: You may pay any amount of {E}. If you do, draw X cards, where X is the amount paid.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'payAnyAmount',
          symbol: 'E',
          ifPaid: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } },
        },
      },
    ],
  }),
  // "{T}: Create a 3/3 colorless Vehicle artifact token named Hull with flying and crew 2."
  singleFace({
    name: 'SYNTHETIC Hull Maker',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Create a 3/3 colorless Vehicle artifact token named Hull with crew 2.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Hull',
              manaCost: null,
              supertypes: [],
              types: ['artifact'],
              subtypes: ['Vehicle'],
              colors: [],
              power: 3,
              toughness: 3,
              loyalty: null,
              defense: null,
              oracleText: 'Crew 2',
              abilities: [{ kind: 'keyword', keyword: { kind: 'crew', power: 2 } }],
            },
          },
        },
      },
    ],
  }),
  // "{T}: You may cast any number of spells from your hand without paying their mana costs."
  singleFace({
    name: 'SYNTHETIC Free Caster',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: You may cast any number of spells from your hand without paying their mana costs.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'castFree',
          objects: { kind: 'choose', filter: { zone: 'hand', notTypes: ['land'] } },
          max: 'any',
        },
      },
    ],
  }),
];
