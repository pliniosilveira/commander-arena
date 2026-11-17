/**
 * SYNTHETIC CARDS FOR "SACRIFICE ONE OR MORE ARTIFACTS: CHOOSE A COLOR. TARGET PLAYER ADDS MANA" (issue 258, D-581 to D-585). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real card needs from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to these same nodes):
 * an artifact whose activated ability taps it and sacrifices one or more artifacts, has its controller choose a color as it resolves, and has a target player add three mana of that
 * color for each artifact sacrificed (a targeted ability is not a mana ability, CR 605.1a, so it uses the stack), a second artifact with the same cost that draws a card for each
 * artifact sacrificed (the count is no part of the mana), a sorcery that makes three Treasure tokens, an artifact creature to give up, and an instant that counters an
 * activated ability (a mana ability cannot be responded to, the ability of the first card can).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const COLOR_WORDS = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
] as const;

/** "{T}, Sacrifice one or more artifacts" (CR 602.2b, 701.21a: at least one, chosen as the cost is paid). */
const SACRIFICE_ARTIFACTS = {
  kind: 'sacrifice',
  what: { types: ['artifact'] },
  anyNumber: true,
  atLeastOne: true,
} as const;

/**
 * "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (CR 608.2d the controller chooses as the ability resolves, 106.4 the mana
 * goes to the pool of the target player, 605.1a a targeted ability is not a mana ability): the engine's `chooseOne` of the five colors (the controller chooses), each option the
 * mana of that color three times for each artifact the cost sacrificed.
 */
export const CHOOSE_COLOR_ADD_MANA: Effect = {
  kind: 'chooseOne',
  options: COLOR_WORDS.map(([color, label]) => ({
    label,
    effect: {
      kind: 'addMana',
      mana: { kind: 'fixed', mana: [color, color, color], times: { kind: 'sacrificedAsCost' } },
      player: { kind: 'target', id: 't1' },
    } satisfies Effect,
  })),
};

export const SACRIFICE_MANA_ABILITY: Ability = {
  kind: 'activated',
  cost: [{ kind: 'tap' }, SACRIFICE_ARTIFACTS],
  targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
  effect: CHOOSE_COLOR_ADD_MANA,
};

export const SYNTHETIC_SACRIFICE_MANA_LIST: readonly CardDefinition[] = [
  // "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way."
  singleFace({
    name: 'SYNTHETIC Lotus Engine',
    manaCost: ['6'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    abilities: [SACRIFICE_MANA_ABILITY],
  }),
  // "{T}, Sacrifice one or more artifacts: Target player draws a card for each artifact sacrificed this way."
  singleFace({
    name: 'SYNTHETIC Lotus Reader',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}, Sacrifice one or more artifacts: Target player draws a card for each artifact sacrificed this way.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, SACRIFICE_ARTIFACTS],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'draw',
          player: { kind: 'target', id: 't1' },
          count: { kind: 'sacrificedAsCost' },
        },
      },
    ],
  }),
  // "Create three Treasure tokens."
  singleFace({
    name: 'SYNTHETIC Lotus Mint',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Create three Treasure tokens.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'preset', preset: 'Treasure' },
        count: 3,
      },
    },
  }),
  // "Counter target activated ability." (CR 701.6, 605.5a: a mana ability is not on the stack, so it can't be targeted; one with a target is)
  singleFace({
    name: 'SYNTHETIC Lotus Hush',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Counter target activated ability.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'stack', stackKind: 'ability' } } },
      ],
      effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Lotus Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
];
