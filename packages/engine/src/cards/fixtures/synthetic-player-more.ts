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
  // "Whenever one or more creatures you control deal combat damage to a player, if that player controls more creatures than you, draw a card."
  // (a batch trigger: the player of the event is the player damaged)
  singleFace({
    name: 'SYNTHETIC Accord Scout',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Whenever one or more creatures you control deal combat damage to a player, if that player controls more creatures than you, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { types: ['creature'], controller: 'you' },
          to: 'player',
        },
        interveningIf: { kind: 'triggerPlayerHasMore', stat: 'creatures' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "Flying
  //  Whenever this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your
  //  library for a Plains card, put it onto the battlefield tapped, then shuffle." (the trigger's own condition `triggerCondition`, read once as the damage is dealt)
  singleFace({
    name: 'SYNTHETIC Map Hawk',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 1,
    oracleText:
      "Flying\nWhenever this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
        triggerCondition: { kind: 'triggerPlayerHasMore', stat: 'lands' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'search',
                player: { kind: 'you' },
                filter: { subtypes: ['Plains'] },
                max: 1,
                destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
                reveal: false,
                shuffle: true,
                optional: true,
              },
            },
          ],
        },
      },
    ],
  }),
  // A land that is not basic and has the land type Plains (CR 205.3i): "({T}: Add {W} or {G}.)"
  singleFace({
    name: 'SYNTHETIC Plains Forest Dual',
    manaCost: null,
    types: ['land'],
    subtypes: ['Plains', 'Forest'],
    colors: [],
    colorIdentity: ['W', 'G'],
    oracleText: '({T}: Add {W} or {G}.)',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['W'] } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
];
