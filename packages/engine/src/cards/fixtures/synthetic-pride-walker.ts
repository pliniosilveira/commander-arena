/**
 * SYNTHETIC PLANESWALKER OF THE PRIDE (D-911 to D-913). NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of the abilities the Bruna deck program (issue 5) needed of a planeswalker that gains life and wipes the other side of the board: a
 * token that is named, has an ability of its own that reads life gained ("Whenever you gain life, put a +1/+1 counter on this token", CR 111.3, 111.4), an exile of the
 * walker itself and of every artifact and creature the opponents control with a test of the life total against the starting life total at resolution
 * (CR 608.2c, 119.1, 903.7), and a gain of life equal to a count of two kinds of permanent you control. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text. The parser test of the real card (`parser-p70-ajani.test.ts`) reads the real Oracle text and compares what it
 * lowers to with the abilities here, so the two cannot drift apart.
 */
import type { Ability, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { loyaltyAbility } from './synthetic-planeswalkers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

/** "a 2/2 white Cat Soldier creature token named Pridemate with 'Whenever you gain life, put a +1/+1 counter on this token.'" */
export const SYNTHETIC_PRIDEMATE: TokenDefinition = {
  name: 'Pridemate',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Cat', 'Soldier'],
  colors: ['W'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: 'Whenever you gain life, put a +1/+1 counter on Pridemate.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'lifeGained', who: 'you' },
      effect: { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
    },
  ],
};

/** The abilities, as the parser lowers the real Oracle text of the card this fixture stands for. */
export const SYNTHETIC_PRIDE_WALKER_ABILITIES: readonly Ability[] = [
  // "+1: You gain life equal to the number of creatures you control plus the number of planeswalkers you control."
  loyaltyAbility(1, {
    kind: 'gainLife',
    player: YOU,
    amount: {
      kind: 'sum',
      of: [
        { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
        { kind: 'countOf', filter: { types: ['planeswalker'], controller: 'you' } },
      ],
    },
  }),
  // "-2: Create a 2/2 white Cat Soldier creature token named Pridemate with 'Whenever you gain life, put a +1/+1 counter on this token.'"
  loyaltyAbility(-2, {
    kind: 'createToken',
    token: { kind: 'custom', definition: SYNTHETIC_PRIDEMATE },
    count: 1,
  }),
  // "0: If you have at least 15 life more than your starting life total, exile this planeswalker and each artifact and creature your opponents control."
  loyaltyAbility(0, {
    kind: 'conditional',
    condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 15 }, aboveStarting: true },
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: THIS },
        {
          kind: 'exile',
          objects: {
            kind: 'each',
            filter: {
              zone: 'battlefield',
              controller: 'opponent',
              anyOf: [{ types: ['artifact'] }, { types: ['creature'] }],
            },
          },
        },
      ],
    },
  }),
];

export const SYNTHETIC_PRIDE_WALKER_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Pride Walker',
    manaCost: ['2', 'W', 'W'],
    supertypes: ['legendary'],
    types: ['planeswalker'],
    subtypes: ['Dack'],
    colors: ['W'],
    colorIdentity: ['W'],
    loyalty: 5,
    oracleText:
      '+1: You gain life equal to the number of creatures you control plus the number of planeswalkers you control.\n−2: Create a 2/2 white Cat Soldier creature token named Pridemate with "Whenever you gain life, put a +1/+1 counter on this token."\n0: If you have at least 15 life more than your starting life total, exile this planeswalker and each artifact and creature your opponents control.',
    abilities: [...SYNTHETIC_PRIDE_WALKER_ABILITIES],
  }),
];
