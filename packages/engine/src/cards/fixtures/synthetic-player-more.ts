/**
 * SYNTHETIC CARDS FOR "THAT PLAYER CONTROLS MORE ... THAN YOU" IN A TRIGGER ABOUT A PLAYER. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Bruna deck (Keeper of the Accord): the intervening "if" `triggerPlayerHasMore` compares the player the event is
 * about (the active player of a step trigger, `triggerPlayer`) with the controller of the ability. Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const SOLDIER = {
  kind: 'custom',
  definition: {
    name: 'Soldier',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
} as const;

export const SYNTHETIC_PLAYER_MORE_LIST: readonly CardDefinition[] = [
  // "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token.
  //  At the beginning of each opponent's end step, if that player controls more lands than you, you may search your library for a basic Plains
  //  card, put it onto the battlefield tapped, then shuffle."
  singleFace({
    name: 'SYNTHETIC Accord Warden',
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 4,
    oracleText:
      "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token. At the beginning of each opponent's end step, if that player controls more lands than you, you may search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'opponent' },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'creatures' },
        effect: { kind: 'createToken', count: 1, token: SOLDIER },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'opponent' },
        optional: true,
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['land'], supertypes: ['basic'], subtypes: ['Plains'] },
          max: 1,
          destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
          reveal: false,
          shuffle: true,
        },
      },
    ],
  }),
  // "At the beginning of each player's upkeep, if that player controls more lands than you, that player loses 1 life."
  singleFace({
    name: 'SYNTHETIC Land Tax',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "At the beginning of each player's upkeep, if that player controls more lands than you, that player loses 1 life.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 1 },
      },
    ],
  }),
];
