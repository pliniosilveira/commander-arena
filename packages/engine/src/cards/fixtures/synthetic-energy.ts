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
];
