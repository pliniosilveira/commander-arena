/**
 * SYNTHETIC CARDS FOR LIFE THAT CAN'T BE GAINED, LIFE LOST THIS TURN AND LIFE PAID. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Hashaton deck program, group 2 (D-1110 to D-1112, provisional numbers): "Your opponents can't gain life." (`cantGainLife`),
 * "each opponent loses life equal to the life that player lost this turn" (`lifeLostThisTurn`), "if you gained life this turn" at each end step, and "you may
 * pay that much life. If you do, draw that many cards" (a `mayPay` whose life is the life gained). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const ANGEL_TOKEN: Effect = {
  kind: 'createToken',
  count: 1,
  token: {
    kind: 'custom',
    definition: {
      name: 'Angel',
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes: ['Angel'],
      colors: ['W'],
      power: 4,
      toughness: 4,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [kw('flying')],
    },
  },
};

/** "Your opponents can't gain life." */
const CANT_GAIN: Ability = { kind: 'static', static: { kind: 'cantGainLife', who: 'opponents' } };

/** "At the beginning of each end step, each opponent loses life equal to the life that player lost this turn." */
const END_DRAIN: Ability = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: {
    kind: 'loseLife',
    player: { kind: 'eachOpponent' },
    amount: { kind: 'lifeLostThisTurn' },
  },
};

/** "Whenever you gain life, you may pay that much life. If you do, draw that many cards." */
const PAY_THAT_MUCH: Ability = {
  kind: 'triggered',
  trigger: { kind: 'lifeGained', who: 'you' },
  effect: {
    kind: 'mayPay',
    cost: [{ kind: 'payLife', amount: { kind: 'triggerDamage' } }],
    effect: { kind: 'draw', player: YOU, count: { kind: 'triggerDamage' } },
  },
};

const creature = (
  name: string,
  cost: readonly string[],
  colors: readonly ('W' | 'U' | 'B' | 'R' | 'G')[],
  subtypes: readonly string[],
  power: number,
  toughness: number,
  abilities: readonly Ability[],
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...cost],
    types: ['creature'],
    subtypes: [...subtypes] as never,
    colors: [...colors],
    colorIdentity: [...colors],
    power,
    toughness,
    oracleText: words,
    abilities: [...abilities],
  });

export const SYNTHETIC_HASHATON_G2_LIST: readonly CardDefinition[] = [
  // "Your opponents can't gain life." (CR 119.7), on its own.
  singleFace({
    name: 'SYNTHETIC Joyless Idol',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: "Your opponents can't gain life.",
    abilities: [CANT_GAIN],
  }),
  // "At the beginning of each end step, each opponent loses life equal to the life that player lost this turn." on its own.
  creature(
    'SYNTHETIC Grudge Demon',
    ['3', 'B', 'B'],
    ['B'],
    ['Demon'],
    4,
    4,
    [END_DRAIN],
    'At the beginning of each end step, each opponent loses life equal to the life that player lost this turn.',
  ),
  // Both together, with flying, the shape of the real card.
  creature(
    'SYNTHETIC Hollow Demon',
    ['6', 'B', 'B'],
    ['B'],
    ['Demon'],
    6,
    6,
    [kw('flying'), CANT_GAIN, END_DRAIN],
    "Flying. Your opponents can't gain life. At the beginning of each end step, each opponent loses life equal to the life that player lost this turn.",
  ),
  // "At the beginning of each end step, if you gained life this turn, create a 4/4 white Angel creature token with flying." (CR 603.4), on its own.
  creature(
    'SYNTHETIC Dusk Seraph',
    ['5', 'W', 'W'],
    ['W'],
    ['Angel'],
    4,
    4,
    [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 1 },
        effect: ANGEL_TOKEN,
      },
    ],
    'Flying. At the beginning of each end step, if you gained life this turn, create a 4/4 white Angel creature token with flying.',
  ),
  // "Whenever you gain life, you may pay that much life. If you do, draw that many cards. {T}: Each opponent loses 1 life and you gain 1 life."
  creature(
    'SYNTHETIC Ghostly Dragon',
    ['2', 'W', 'W', 'B', 'B'],
    ['W', 'B'],
    ['Spirit', 'Dragon'],
    4,
    4,
    [
      kw('flying'),
      PAY_THAT_MUCH,
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', player: YOU, amount: 1 },
          ],
        },
      },
    ],
    'Flying. Whenever you gain life, you may pay that much life. If you do, draw that many cards. {T}: Each opponent loses 1 life and you gain 1 life.',
  ),
  // The mana version of the same shape: "Whenever you gain life, you may pay {2}. If you do, draw that many cards." The life gained is the number drawn.
  singleFace({
    name: 'SYNTHETIC Paid Well',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever you gain life, you may pay {2}. If you do, draw that many cards.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['2'] }],
          effect: { kind: 'draw', player: YOU, count: { kind: 'triggerDamage' } },
        },
      },
    ],
  }),
];
