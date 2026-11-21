/**
 * SYNTHETIC CARDS FOR STATION. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Station (CR 702.184, 721): the keyword, the abilities a station symbol gates behind charge counters, and the mana
 * abilities whose amount is a count (CR 605.1a, 605.3b). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does;
 * it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const STATION = { kind: 'keyword', keyword: { kind: 'station' } } as const;

export const SYNTHETIC_STATION_LIST: readonly CardDefinition[] = [
  // "{T}: Add {G}. Station. 3+ | {G}, {T}: Add {G} for each artifact you control."
  singleFace({
    name: 'SYNTHETIC Station Land',
    manaCost: null,
    types: ['land'],
    subtypes: ['Planet'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. Station. 3+ | {G}, {T}: Add {G} for each artifact you control.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      STATION,
      {
        kind: 'stationLevel',
        threshold: 3,
        abilities: [
          {
            kind: 'mana',
            cost: [{ kind: 'mana', symbols: ['G'] }, { kind: 'tap' }],
            production: {
              kind: 'fixed',
              mana: ['G'],
              times: { kind: 'countOf', filter: { types: ['artifact'], controller: 'you' } },
            },
          },
        ],
      },
    ],
  }),
  // "{T}: Add {C}{C}{C}. Station. 5+ | {T}: Add X mana of any one color, where X is the number of charge counters on this."
  singleFace({
    name: 'SYNTHETIC Station Spacecraft',
    manaCost: ['5'],
    types: ['artifact'],
    subtypes: ['Spacecraft'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Add {C}{C}{C}. Station. 5+ | {T}: Add X mana of any one color, where X is the number of charge counters on this.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C', 'C', 'C'] },
      },
      STATION,
      {
        kind: 'stationLevel',
        threshold: 5,
        abilities: [
          {
            kind: 'mana',
            cost: [{ kind: 'tap' }],
            production: {
              kind: 'anyColorAmount',
              amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'charge' },
            },
          },
        ],
      },
    ],
  }),
  // "{T}: Add {G} for each creature you control." (a mana ability whose amount is a count, alone)
  singleFace({
    name: 'SYNTHETIC Count Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G} for each creature you control.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: {
          kind: 'fixed',
          mana: ['G'],
          times: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
        },
      },
    ],
  }),
  // "Station. 4+ | Flying [3/4]" (CR 721.2b: at 4 or more charge counters it has flying and is a creature with base power and toughness 3/4 in addition to its other types)
  singleFace({
    name: 'SYNTHETIC Station Creature Spacecraft',
    manaCost: ['3'],
    types: ['artifact'],
    subtypes: ['Spacecraft'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Station. 4+ | Flying [3/4]',
    abilities: [
      STATION,
      {
        kind: 'stationLevel',
        threshold: 4,
        abilities: [
          { kind: 'keyword', keyword: { kind: 'flying' } },
          {
            kind: 'static',
            static: {
              kind: 'setTypes',
              subject: { kind: 'this' },
              additive: true,
              types: ['creature'],
            },
          },
          {
            kind: 'static',
            static: { kind: 'setPt', subject: { kind: 'this' }, power: 3, toughness: 4 },
          },
        ],
      },
    ],
  }),
];
