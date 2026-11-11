/**
 * SYNTHETIC ASCEND CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Ascend on a permanent (CR 702.131b) and of "you have the city's blessing" (CR 702.131c). Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Condition, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const tap: Cost = { kind: 'tap' };
const HAS_BLESSING: Condition = {
  kind: 'playerHasDesignation',
  player: { kind: 'you' },
  designation: 'citysBlessing',
};

export const SYNTHETIC_ASCEND_LIST: readonly CardDefinition[] = [
  // Ascend on a permanent, and nothing else (CR 702.131b).
  singleFace({
    name: 'SYNTHETIC Ascend Banner',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Ascend',
    abilities: [kw('ascend')],
  }),
  // A creature with Ascend: layer 6 can take the ability away, and a creature can phase out (CR 702.131b).
  singleFace({
    name: 'SYNTHETIC Ascend Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Ascend',
    abilities: [kw('ascend')],
  }),
  // A land with Ascend whose ability asks for the blessing (the shape of a real city land).
  singleFace({
    name: 'SYNTHETIC Blessed Spring',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Ascend\n{T}: Add {C}.\n{5}, {T}: Draw a card. Activate only if you have the city’s blessing.',
    abilities: [
      kw('ascend'),
      { kind: 'mana', cost: [tap], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['5'] }, tap],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        activateOnlyIf: HAS_BLESSING,
      },
    ],
  }),
  // The same restriction with no Ascend: the designation is gained by Ascend, never by merely counting permanents.
  singleFace({
    name: 'SYNTHETIC Blessing Gate',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: You gain 1 life. Activate only if you have the city’s blessing.',
    abilities: [
      {
        kind: 'activated',
        cost: [tap],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        activateOnlyIf: HAS_BLESSING,
      },
    ],
  }),
  // The same condition read for another player (CR 702.131c: any number of players may have it).
  singleFace({
    name: 'SYNTHETIC Envious Gate',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: You gain 1 life. Activate only if an opponent has the city’s blessing.',
    abilities: [
      {
        kind: 'activated',
        cost: [tap],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        activateOnlyIf: {
          kind: 'playerHasDesignation',
          player: { kind: 'eachOpponent' },
          designation: 'citysBlessing',
        },
      },
    ],
  }),
];
