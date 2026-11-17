/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE GALADRIEL DECK (issue 43, D-538 to D-546 numbers). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a creature that makes every nontoken creature its controller controls a Forest land as well (with a power and toughness of the number of lands), a creature
 * that gets +1/+1 for each land its controller controls and each land card in their graveyard and can return from the graveyard for two lands returned to the hand, a sorcery that
 * mills four cards and puts up to two land cards among them into the hand, a creature that makes a legendary token with a defined power and toughness when it enters and puts a land
 * card from the hand or the graveyard onto the battlefield when its controller attacks, and a land with typecycling for a creature type. Names start with "SYNTHETIC "; oracleId
 * is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

/** "Lands you control". */
const LANDS_YOU_CONTROL: ObjectFilter = { types: ['land'], controller: 'you' };

/** "The number of lands you control": what a characteristic-defining ability and a token's own use. */
const LAND_COUNT = { kind: 'countOf', filter: LANDS_YOU_CONTROL } as const;

/** "Each land you control and each land card in your graveyard", as one amount. */
const LANDS_AND_LAND_CARDS = {
  kind: 'sum',
  of: [
    { kind: 'countOf', filter: LANDS_YOU_CONTROL },
    { kind: 'countOf', filter: { zone: 'graveyard', types: ['land'], controller: 'you' } },
  ],
} as const;

/** "~'s power and toughness are each equal to the number of lands you control": the characteristic-defining ability. */
export const LAND_COUNT_DEFINES_PT: Ability = {
  kind: 'static',
  static: { kind: 'characteristicPt', power: LAND_COUNT, toughness: LAND_COUNT },
};

/** "Nontoken creatures you control are Forest lands in addition to their other types." */
export const CREATURES_ARE_FORESTS: Ability = {
  kind: 'static',
  static: {
    kind: 'setTypes',
    subject: {
      kind: 'filter',
      filter: { types: ['creature'], token: false, controller: 'you' },
    },
    additive: true,
    subtypes: ['Forest'],
    types: ['land'],
  },
};

/** "{1}{G}, Return two lands you control to their owner's hand: Return this card from your graveyard to your hand." */
export const RETURN_FROM_GRAVEYARD: Ability = {
  kind: 'activated',
  cost: [
    { kind: 'mana', symbols: ['1', 'G'] },
    { kind: 'returnToHand', what: LANDS_YOU_CONTROL, count: 2 },
  ],
  effect: { kind: 'moveToZone', objects: THIS, to: 'hand' },
  functionsIn: 'graveyard',
};

/** "Mill four cards, then put up to two land cards from among them into your hand." */
export const MILL_FOUR_TAKE_TWO_LANDS = {
  kind: 'sequence',
  effects: [
    { kind: 'mill', player: YOU, count: 4 },
    {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { types: ['land'], zone: 'graveyard', controller: 'you' },
        count: 2,
        optional: true,
        fromMoved: true,
      },
      to: 'hand',
    },
  ],
} as const;

/** The token of the enters trigger: a legendary Ox whose power and toughness its own ability defines. */
export const OX_TOKEN_NAME = 'SYNTHETIC Ox Token';
export const OX_TOKEN_TEXT =
  "SYNTHETIC Ox Token's power and toughness are each equal to the number of lands you control.";

/** "Whenever you attack, draw a card, then you may put a land card from your hand or graveyard onto the battlefield." */
export const ATTACK_DRAW_THEN_PUT_LAND: Ability = {
  kind: 'triggered',
  trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'draw', player: YOU, count: 1 },
      {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'hand', types: ['land'], controller: 'you' },
          optional: true,
          alsoGraveyard: true,
        },
        to: 'battlefield',
      },
    ],
  },
};

/** "When this creature enters, create <the Ox>, a legendary blue Ox creature token with ...". */
export const ENTERS_CREATE_OX: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: THIS },
  effect: {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        name: OX_TOKEN_NAME,
        manaCost: null,
        supertypes: ['legendary'],
        types: ['creature'],
        subtypes: ['Ox'],
        colors: ['U'],
        power: '*',
        toughness: '*',
        loyalty: null,
        defense: null,
        oracleText: OX_TOKEN_TEXT,
        abilities: [LAND_COUNT_DEFINES_PT],
      },
    },
    count: 1,
  },
};

/** "Halflingcycling {4}": search the library for a Halfling card. */
export const HALFLING_CYCLING: Ability = {
  kind: 'keyword',
  keyword: {
    kind: 'typecycling',
    filter: { subtypes: ['Halfling'] },
    cost: [{ kind: 'mana', symbols: ['4'] }],
  },
};

export const SYNTHETIC_GALADRIEL_G2_LIST: readonly CardDefinition[] = [
  // "~'s power and toughness are each equal to the number of lands you control. Nontoken creatures you control are Forest lands in addition to their other types."
  singleFace({
    name: 'SYNTHETIC Forest Heart',
    manaCost: ['3', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: '*',
    toughness: '*',
    oracleText:
      "SYNTHETIC Forest Heart's power and toughness are each equal to the number of lands you control.\nNontoken creatures you control are Forest lands in addition to their other types.",
    abilities: [LAND_COUNT_DEFINES_PT, CREATURES_ARE_FORESTS],
  }),
  // "Reach, trample. This gets +1/+1 for each land you control and each land card in your graveyard. {1}{G}, Return two lands you control to their owner's hand: Return this card from your graveyard to your hand."
  singleFace({
    name: 'SYNTHETIC Land Avatar',
    manaCost: ['4', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Elemental', 'Avatar'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 0,
    toughness: 0,
    oracleText:
      "Reach, trample\nThis creature gets +1/+1 for each land you control and each land card in your graveyard.\n{1}{G}, Return two lands you control to their owner's hand: Return this card from your graveyard to your hand.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'reach' } },
      { kind: 'keyword', keyword: { kind: 'trample' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: THIS,
          power: LANDS_AND_LAND_CARDS,
          toughness: LANDS_AND_LAND_CARDS,
        },
      },
      RETURN_FROM_GRAVEYARD,
    ],
  }),
  // "Mill four cards, then put up to two land cards from among them into your hand."
  singleFace({
    name: 'SYNTHETIC Mill Four Take Two',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Mill four cards, then put up to two land cards from among them into your hand.',
    spell: { effect: MILL_FOUR_TAKE_TWO_LANDS },
  }),
  // "Reach. When this creature enters, create <the Ox>. Whenever you attack, draw a card, then you may put a land card from your hand or graveyard onto the battlefield."
  singleFace({
    name: 'SYNTHETIC Land Giant',
    manaCost: ['3', 'G', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Giant', 'Scout'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    power: 6,
    toughness: 5,
    oracleText:
      'Reach\nWhen this creature enters, create SYNTHETIC Ox Token, a legendary blue Ox creature token with "SYNTHETIC Ox Token\'s power and toughness are each equal to the number of lands you control."\nWhenever you attack, draw a card, then you may put a land card from your hand or graveyard onto the battlefield.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'reach' } },
      ENTERS_CREATE_OX,
      ATTACK_DRAW_THEN_PUT_LAND,
    ],
  }),
  // "Halflingcycling {4}": the land the tests cycle (the real card has a search for a basic land before it).
  singleFace({
    name: 'SYNTHETIC Halfling Hole',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Halflingcycling {4}',
    abilities: [HALFLING_CYCLING],
  }),
  // The card that Halflingcycling finds.
  singleFace({
    name: 'SYNTHETIC Halfling Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Halfling', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 2,
    oracleText: '',
  }),
];
