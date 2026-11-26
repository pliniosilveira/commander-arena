/**
 * SYNTHETIC CARDS FOR "TAP X UNTAPPED TOKENS YOU CONTROL: ADD X MANA IN ANY COMBINATION OF COLORS" (Hazel of the Rootbloom shape). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the mana ability with a ranged X: a creature with that ability, and spells that make the tokens to tap (untapped creature tokens, tapped ones,
 * Treasures) and a cost to pay with the mana. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const SQUIRREL: Extract<Effect, { kind: 'createToken' }>['token'] = {
  kind: 'custom',
  definition: {
    name: 'Squirrel',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Squirrel'],
    colors: ['G'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

export const SYNTHETIC_TAP_X_LIST: readonly CardDefinition[] = [
  // "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors."
  singleFace({
    name: 'SYNTHETIC Rootbloom Druid',
    manaCost: ['2', 'B', 'G'],
    types: ['creature'],
    subtypes: ['Squirrel', 'Druid'],
    colors: ['B', 'G'],
    colorIdentity: ['B', 'G'],
    power: 3,
    toughness: 5,
    oracleText:
      '{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.',
    abilities: [
      {
        kind: 'mana',
        cost: [
          { kind: 'tap' },
          { kind: 'payLife', amount: 2 },
          { kind: 'tapPermanentsX', filter: { token: true } },
        ],
        production: { kind: 'anyCombinationTapped' },
      },
    ],
  }),
  // "Create four 1/1 green Squirrel creature tokens."
  singleFace({
    name: 'SYNTHETIC Squirrel Swarm',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create four 1/1 green Squirrel creature tokens.',
    spell: { effect: { kind: 'createToken', token: SQUIRREL, count: 4 } },
  }),
  // "Create two tapped 1/1 green Squirrel creature tokens."
  singleFace({
    name: 'SYNTHETIC Tired Swarm',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create two tapped 1/1 green Squirrel creature tokens.',
    spell: { effect: { kind: 'createToken', token: SQUIRREL, count: 2, tapped: true } },
  }),
  // "Create two Treasure tokens."
  singleFace({
    name: 'SYNTHETIC Coin Rain',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create two Treasure tokens.',
    spell: {
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 2 },
    },
  }),
  // "{W}{U}{B}{R}{G}": the cost whose five colors only a combination of five mana of different colors pays.
  singleFace({
    name: 'SYNTHETIC Prism Rite',
    manaCost: ['W', 'U', 'B', 'R', 'G'],
    types: ['sorcery'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    oracleText: 'You gain 1 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
  // "{1}{W}{U}": a spell that needs two colors and one more mana, to be paid with the mana of the ability.
  singleFace({
    name: 'SYNTHETIC Triad Rite',
    manaCost: ['1', 'W', 'U'],
    types: ['sorcery'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    oracleText: 'You gain 1 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
];
