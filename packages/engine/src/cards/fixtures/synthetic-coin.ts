/**
 * SYNTHETIC CARDS FOR FLIPPING A COIN. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the coin flip (CR 705): a creature that flips a coin when it enters (its controller calls heads or tails: the engine's
 * `chooseOne` of two `coinFlip` instructions, one for each call) and has "whenever you win a coin flip" and "whenever an opponent wins a coin flip"
 * triggers. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "Flip a coin": the controller calls heads or tails, then the coin is flipped (CR 705.2). */
export const FLIP_A_COIN: Effect = {
  kind: 'chooseOne',
  options: [
    { label: 'Heads', effect: { kind: 'coinFlip', call: 'heads' } },
    { label: 'Tails', effect: { kind: 'coinFlip', call: 'tails' } },
  ],
};

export const SYNTHETIC_COIN_LIST: readonly CardDefinition[] = [
  // "When this creature enters, flip a coin. / Whenever you win a coin flip, you gain 3 life. / Whenever an opponent wins a coin flip, you lose 1 life."
  singleFace({
    name: 'SYNTHETIC Coin Gambler',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Human', 'Rogue'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, flip a coin.\nWhenever you win a coin flip, you gain 3 life.\nWhenever an opponent wins a coin flip, you lose 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: FLIP_A_COIN,
      },
      {
        kind: 'triggered',
        trigger: { kind: 'winsCoinFlip', who: 'you' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'winsCoinFlip', who: 'opponent' },
        effect: { kind: 'loseLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // "When this creature enters, flip a coin." and nothing that watches: the flip by an opponent's creature.
  singleFace({
    name: 'SYNTHETIC Coin Tosser',
    manaCost: ['R'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText: 'When this creature enters, flip a coin.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: FLIP_A_COIN,
      },
    ],
  }),
];
