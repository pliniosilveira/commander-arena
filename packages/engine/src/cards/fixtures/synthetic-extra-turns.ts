/**
 * SYNTHETIC EXTRA TURN CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of extra turns (CR 500.7): "Take an extra turn after this one", the same for a target player, and an activated ability that
 * puts its own permanent on the bottom of its owner's library as a cost and asks for the city's blessing. Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text.
 */
import type { TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const ANY_PLAYER: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };

export const SYNTHETIC_EXTRA_TURNS_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Time Lesson',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Take an extra turn after this one.',
    spell: { effect: { kind: 'extraTurn', player: YOU } },
  }),
  singleFace({
    name: 'SYNTHETIC Borrowed Hour',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target player takes an extra turn after this one.',
    spell: {
      targets: [ANY_PLAYER],
      effect: { kind: 'extraTurn', player: { kind: 'target', id: 't1' } },
    },
  }),
  // The shape of a creature that leaves for the bottom of its owner's library to take the turn, once its controller has the city's blessing.
  singleFace({
    name: 'SYNTHETIC Time Pilot',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Pirate'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText:
      "Ascend\n{T}, Put this creature on the bottom of its owner's library: Take an extra turn after this one. Activate only if you have the city's blessing.",
    abilities: [
      kw('ascend'),
      {
        kind: 'activated',
        cost: [
          { kind: 'tap' },
          { kind: 'returnToHand', what: { kind: 'this' }, toLibraryBottom: true },
        ],
        effect: { kind: 'extraTurn', player: YOU },
        activateOnlyIf: {
          kind: 'playerHasDesignation',
          player: YOU,
          designation: 'citysBlessing',
        },
      },
    ],
  }),
];
