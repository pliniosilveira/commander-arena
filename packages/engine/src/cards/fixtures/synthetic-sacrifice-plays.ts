/**
 * SYNTHETIC CARDS FOR PERMISSIONS THAT SACRIFICES AND POWERS TURN ON. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of four general pieces: casting creature spells from the top of the library while the controller has creatures with N different powers
 * (`castFromTopOfLibrary` with an `amountIs` of `differentPowersAmong`), playing the cards a permanent exiled with its linked ability during the controller's turn once they have
 * sacrificed a nontoken permanent that turn (`playFromLinkedExile` and `sacrificedThisTurn`), casting a permanent spell from the graveyard once each turn by sacrificing a land
 * (`playFromGraveyardOnceEachTurn` with `sacrifice`), and "whenever you sacrifice another nontoken permanent during your turn" (`permanentSacrificed` with `duringTurn`). Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const LAND_COST = { kind: 'sacrifice', what: { types: ['land'], controller: 'you' } } as const;

/** "{T}, Sacrifice a land: you gain 1 life", the way a test gives a permanent a sacrifice to make at will (CR 701.21a). */
const SACRIFICE_A_LAND: Ability = {
  kind: 'activated',
  cost: [LAND_COST],
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
};

/** "Sacrifice a creature: you gain 1 life". */
const SACRIFICE_A_CREATURE: Ability = {
  kind: 'activated',
  cost: [{ kind: 'sacrifice', what: { types: ['creature'], controller: 'you' } }],
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
};

/** "A 1/1 white Zombie creature token". */
const ZOMBIE: TokenDefinition = {
  name: 'Zombie',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['W'],
  power: 1,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "{0}: Create a 1/1 white Zombie creature token", the way a test gets a token to sacrifice (CR 111.1). */
const MAKE_A_TOKEN: Ability = {
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['0'] }],
  effect: { kind: 'createToken', token: { kind: 'custom', definition: ZOMBIE }, count: 1 },
};

export const SYNTHETIC_SACRIFICE_PLAYS_LIST: readonly CardDefinition[] = [
  // "As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library."
  singleFace({
    name: 'SYNTHETIC Coven Seer',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: { types: ['creature'] } },
        condition: {
          kind: 'amountIs',
          amount: {
            kind: 'differentPowersAmong',
            filter: { types: ['creature'], controller: 'you' },
          },
          compare: { cmp: 'atLeast', value: 3 },
        },
      },
    ],
  }),
  // "Whenever you sacrifice a nontoken permanent, exile the top card of your library. During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards
  //  exiled with this creature. Sacrifice a land: You gain 1 life. Sacrifice a creature: You gain 1 life."
  singleFace({
    name: 'SYNTHETIC Sacrifice Hoarder',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Insect'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever you sacrifice a nontoken permanent, exile the top card of your library. During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with this creature. Sacrifice a land: You gain 1 life. Sacrifice a creature: You gain 1 life. {0}: Create a 1/1 white Zombie creature token.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'permanentSacrificed', by: 'you', filter: { token: false } },
        effect: { kind: 'exileTop', count: 1, linked: true },
      },
      {
        kind: 'static',
        static: { kind: 'playFromLinkedExile' },
        condition: {
          kind: 'and',
          terms: [{ kind: 'yourTurn' }, { kind: 'sacrificedThisTurn', token: false }],
        },
      },
      SACRIFICE_A_LAND,
      SACRIFICE_A_CREATURE,
      MAKE_A_TOKEN,
    ],
  }),
  // "Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs."
  singleFace({
    name: 'SYNTHETIC Salvage Hulk',
    manaCost: ['G'],
    types: ['artifact'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          cast: {
            anyOf: [
              { types: ['artifact'] },
              { types: ['creature'] },
              { types: ['enchantment'] },
              { types: ['planeswalker'] },
              { types: ['battle'] },
            ],
          },
          sacrifice: { types: ['land'] },
        },
      },
      SACRIFICE_A_LAND,
      SACRIFICE_A_CREATURE,
    ],
  }),
  // "Whenever you sacrifice another nontoken permanent during your turn, put a number of +1/+1 counters equal to this creature's power on up to one other target creature."
  singleFace({
    name: 'SYNTHETIC Counter Shepherd',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Shepherd'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever you sacrifice another nontoken permanent during your turn, put a number of +1/+1 counters equal to this creature's power on up to one other target creature. Sacrifice a land: You gain 1 life. Sacrifice a creature: You gain 1 life.",
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'permanentSacrificed',
          by: 'you',
          filter: { token: false, other: true },
          duringTurn: 'you',
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], other: true },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: { kind: 'powerOf', of: { kind: 'this' } },
        },
      },
      SACRIFICE_A_LAND,
      SACRIFICE_A_CREATURE,
    ],
  }),
];
