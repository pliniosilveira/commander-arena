/**
 * SYNTHETIC CARDS FOR "EXILE THE TOP CARD, YOU MAY PLAY IT". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "Exile the top card of your library. You may play that card this turn.", the same for
 * two cards until the end of your next turn, an upkeep trigger of that shape, and "exile the top X cards ... You may play those cards until
 * your next end step. At the beginning of your next end step, ~ deals 2 damage to each opponent for each of those cards that are still
 * exiled." Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is
 * the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const MOVED = { kind: 'moved' } as const;

export const SYNTHETIC_DRAGONS_IMPULSE_LIST: readonly CardDefinition[] = [
  // "Exile the top card of your library. You may play that card this turn."
  singleFace({
    name: 'SYNTHETIC Impulse Rite',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Exile the top card of your library. You may play that card this turn.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 1 },
          { kind: 'mayPlay', objects: MOVED, lasts: 'endOfTurn' },
        ],
      },
    },
  }),
  // "Exile the top two cards of your library. Until the end of your next turn, you may play those cards."
  singleFace({
    name: 'SYNTHETIC Long Impulse Rite',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', count: 2 },
          { kind: 'mayPlay', objects: MOVED, lasts: 'endOfYourNextTurn' },
        ],
      },
    },
  }),
  // "At the beginning of your upkeep, exile the top card of your library. You may play that card this turn."
  singleFace({
    name: 'SYNTHETIC Luck Altar',
    manaCost: ['R', 'R', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'At the beginning of your upkeep, exile the top card of your library. You may play that card this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileTop', count: 1 },
            { kind: 'mayPlay', objects: MOVED, lasts: 'endOfTurn' },
          ],
        },
      },
    ],
  }),
  // "Whenever this creature enters or attacks, exile the top X cards of your library, where X is the number of creatures you control with
  //  power 4 or greater. You may play those cards until your next end step. At the beginning of your next end step, this creature deals 2
  //  damage to each opponent for each of those cards that are still exiled."
  singleFace({
    name: 'SYNTHETIC Hawk of Fortune',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Bird', 'Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText:
      'Flying. Whenever this creature enters or attacks, exile the top X cards of your library, where X is the number of creatures you control with power 4 or greater. You may play those cards until your next end step. At the beginning of your next end step, this creature deals 2 damage to each opponent for each of those cards that are still exiled.',
    abilities: (() => {
      const effect = {
        kind: 'sequence',
        effects: [
          {
            kind: 'exileTop',
            count: {
              kind: 'countOf',
              filter: {
                types: ['creature'],
                controller: 'you',
                power: { cmp: 'atLeast', value: 4 },
              },
            },
          },
          { kind: 'mayPlay', objects: MOVED, lasts: 'yourNextEndStep' },
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'you' },
            effect: {
              kind: 'dealDamage',
              amount: { kind: 'multiple', factor: 2, of: { kind: 'exiledStillThere' } },
              to: { kind: 'eachOpponent' },
            },
          },
        ],
      } as const;
      return [
        { kind: 'keyword', keyword: { kind: 'flying' } },
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect,
        },
        { kind: 'triggered', trigger: { kind: 'attacks', what: { kind: 'this' } }, effect },
      ];
    })(),
  }),
  // "Flying, trample. When this creature dies, choose one - Exile the top two cards of your library. Until the end of your next turn, you may play those
  //  cards. / Create three Treasure tokens."
  singleFace({
    name: 'SYNTHETIC Dying Dragon',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon', 'Spirit'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying, trample\nWhen this creature dies, choose one - Exile the top two cards of your library. Until the end of your next turn, you may play those cards. / Create three Treasure tokens.',
    abilities: [
      kw('flying'),
      kw('trample'),
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'sequence', effects: [] },
        chooseModes: { min: 1, max: 1 },
        modes: [
          {
            text: 'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
            effect: {
              kind: 'sequence',
              effects: [
                { kind: 'exileTop', count: 2 },
                { kind: 'mayPlay', objects: MOVED, lasts: 'endOfYourNextTurn' },
              ],
            },
          },
          {
            text: 'Create three Treasure tokens.',
            effect: {
              kind: 'createToken',
              token: { kind: 'preset', preset: 'Treasure' },
              count: 3,
            },
          },
        ],
      },
    ],
  }),
];
