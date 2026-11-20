/**
 * SYNTHETIC CARDS FOR A SEARCH FOR ANY NUMBER OF CARDS WITH A TOTAL MANA VALUE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of `search.totalManaValue` (CR 701.23, 202.3). The wording of a real card, the name replaced: "When this creature dies, search your library for any
 * number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle.", with creatures of several mana values to find. Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const creature = (name: string, manaCost: readonly string[] | null, power: number) =>
  singleFace({
    name,
    manaCost,
    types: ['creature'],
    subtypes: ['Beast'],
    colors: [],
    colorIdentity: [],
    power,
    toughness: power,
    oracleText: '',
  });

export const SYNTHETIC_HULK_SEARCH_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Hulking Beast',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText:
      'When this creature dies, search your library for any number of creature cards with total mana value 6 or less, put them onto the battlefield, then shuffle.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['creature'] },
          max: 1,
          totalManaValue: 6,
          destinations: [{ zone: 'battlefield', count: 'rest' }],
          reveal: false,
          shuffle: true,
        },
      },
    ],
  }),
  creature('SYNTHETIC Free Beast', null, 1),
  creature('SYNTHETIC Two Beast', ['2'], 2),
  creature('SYNTHETIC Four Beast', ['4'], 4),
  creature('SYNTHETIC Six Beast', ['6'], 6),
  // {X}{1}: a mana value of 1 in a library (CR 202.3e).
  creature('SYNTHETIC X Beast', ['X', '1'], 1),
  // {X}{X}{3}: still 3, not more.
  creature('SYNTHETIC Double X Beast', ['X', 'X', '3'], 3),
];
