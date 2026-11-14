/**
 * SYNTHETIC CARDS FOR "LOSES THE GAME" AND "EACH PLAYER THIS CREATURE ATTACKED THIS TURN". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-269: the effect `loseGame` (CR 104.3e) with the player selectors `attackedPlayers` (CR 508.6), `eachOpponent` and
 * `eachPlayer`, the trigger "Whenever a creature you control deals combat damage to a player, you and that player each gain that much life" and an
 * end step trigger with an intervening "if you have at least 15 life more than your starting life total" (CR 603.4). Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const fifteenAbove = {
  kind: 'lifeTotal',
  compare: { cmp: 'atLeast', value: 15 },
  aboveStarting: true,
} as const;

const angel = (
  name: string,
  power: number,
  toughness: number,
  abilities: readonly Ability[],
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power,
    toughness,
    oracleText: words,
    abilities: [...abilities],
  });

/** "Whenever a creature you control deals combat damage to a player, you and that player each gain that much life." */
const SHARED_GAIN: Ability = {
  kind: 'triggered',
  trigger: {
    kind: 'dealsCombatDamage',
    what: { types: ['creature'], controller: 'you' },
    to: 'player',
  },
  effect: {
    kind: 'gainLife',
    player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] },
    amount: { kind: 'triggerDamage' },
  },
};

/** "At the beginning of your end step, if you have at least 15 life more than your starting life total, each player this creature attacked this turn loses the game." */
const ATTACKED_LOSE: Ability = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'you' },
  interveningIf: fifteenAbove,
  effect: { kind: 'loseGame', player: { kind: 'attackedPlayers', of: { kind: 'this' } } },
};

export const SYNTHETIC_LOSE_GAME_LIST: readonly CardDefinition[] = [
  // The shape of the card of the owner's deck: all three abilities.
  angel(
    'SYNTHETIC Destiny Angel',
    2,
    6,
    [kw('flying'), kw('doubleStrike'), SHARED_GAIN, ATTACKED_LOSE],
    'Flying, double strike. Whenever a creature you control deals combat damage to a player, you and that player each gain that much life. At the beginning of your end step, if you have at least 15 life more than your starting life total, each player this creature attacked this turn loses the game.',
  ),
  // The loss alone, on a creature with nothing else to change the life totals.
  angel(
    'SYNTHETIC Doom Angel',
    3,
    3,
    [kw('flying'), ATTACKED_LOSE],
    'Flying. At the beginning of your end step, if you have at least 15 life more than your starting life total, each player this creature attacked this turn loses the game.',
  ),
  // The same ability on a permanent that is not a creature: it attacks nothing, so nobody loses.
  singleFace({
    name: 'SYNTHETIC Doom Banner',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'At the beginning of your end step, if you have at least 15 life more than your starting life total, each player this permanent attacked this turn loses the game.',
    abilities: [ATTACKED_LOSE],
  }),
  // "Whenever one or more creatures you control deal combat damage to a player, you and that player each gain 1 life." (a batch event has a player too)
  angel(
    'SYNTHETIC Batch Angel',
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { types: ['creature'], controller: 'you' },
          to: 'player',
        },
        effect: {
          kind: 'gainLife',
          player: { kind: 'all', of: [YOU, { kind: 'triggerPlayer' }] },
          amount: 1,
        },
      },
    ],
    'Whenever one or more creatures you control deal combat damage to a player, you and that player each gain 1 life.',
  ),
  // "At the beginning of your end step, each opponent loses the game."
  angel(
    'SYNTHETIC Doom Herald',
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: { kind: 'loseGame', player: { kind: 'eachOpponent' } },
      },
    ],
    'At the beginning of your end step, each opponent loses the game.',
  ),
  // "At the beginning of your end step, each player loses the game." Everyone loses at once: a draw (CR 104.4a).
  angel(
    'SYNTHETIC Doom Everyone',
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: { kind: 'loseGame', player: { kind: 'eachPlayer' } },
      },
    ],
    'At the beginning of your end step, each player loses the game.',
  ),
];
