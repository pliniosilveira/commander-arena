/**
 * SYNTHETIC CARDS FOR GROUP 2 OF THE DANITHA DECK (issue 26, D-1220 and D-1221, provisional numbers). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Mill four cards. You may put a land card from among them into your hand." (`ChooseSelector.fromMoved` of a `moveToZone`, CR 701.17, 608.2c,
 * 608.2d): the cards a mill put into the graveyard are the only candidates, and the riders the real texts add: "If you don't, put a +1/+1 counter on this creature" (the choice
 * starts what `didPrevious` reads again), "You gain 1 life", "If you put a Town card into your hand this way, you gain 2 life" (`objectMatches` with `inZone`) and "If you
 * control a Squirrel or returned a Squirrel card to your hand this way, create a Food token". Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const mill = (count: number): Effect => ({ kind: 'mill', player: YOU, count });

/** "You may put <filter> from among them into your hand": the cards the mill before it moved, none or one. */
const takeFromMilled = (filter: ObjectFilter): Effect => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { ...filter, zone: 'graveyard', controller: 'you' },
    optional: true,
    fromMoved: true,
  },
  to: 'hand',
});

const PERMANENT_CARD: ObjectFilter = {
  anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map((t) => ({
    types: [t as 'artifact'],
  })),
};

const SQUIRREL: ObjectFilter = { subtypes: ['Squirrel'] };

export const SYNTHETIC_DANITHA_G2_LIST: readonly CardDefinition[] = [
  // "When this creature enters, mill three cards. You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this creature."
  singleFace({
    name: 'SYNTHETIC Mill Three Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elemental'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      "When this creature enters, mill three cards. You may put a land card from among them into your hand. If you don't, put a +1/+1 counter on this creature.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            mill(3),
            takeFromMilled({ types: ['land'] }),
            {
              kind: 'conditional',
              condition: { kind: 'not', term: { kind: 'didPrevious' } },
              effect: {
                kind: 'addCounters',
                objects: { kind: 'this' },
                counter: '+1/+1',
                count: 1,
              },
            },
          ],
        },
      },
    ],
  }),
  // Flying; "... You may put a Plains card or a creature card with mana value 3 or less from among the cards milled this way into your hand. If you don't, put a +1/+1 counter."
  singleFace({
    name: 'SYNTHETIC Mill Three Chaplain',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      "Flying. When this creature enters, mill three cards. You may put a Plains card or a creature card with mana value 3 or less from among the cards milled this way into your hand. If you don't, put a +1/+1 counter on this creature.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            mill(3),
            takeFromMilled({
              anyOf: [
                { subtypes: ['Plains'] },
                { types: ['creature'], manaValue: { cmp: 'atMost', value: 3 } },
              ],
            }),
            {
              kind: 'conditional',
              condition: { kind: 'not', term: { kind: 'didPrevious' } },
              effect: {
                kind: 'addCounters',
                objects: { kind: 'this' },
                counter: '+1/+1',
                count: 1,
              },
            },
          ],
        },
      },
    ],
  }),
  // "Mill four cards. You may put a permanent card from among the cards milled this way into your hand. If you control a Squirrel or returned a Squirrel card to your hand this
  // way, create a Food token."
  singleFace({
    name: 'SYNTHETIC Mill Four Grab',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Mill four cards. You may put a permanent card from among the cards milled this way into your hand. If you control a Squirrel or returned a Squirrel card to your hand this way, create a Food token.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          mill(4),
          takeFromMilled(PERMANENT_CARD),
          {
            kind: 'conditional',
            condition: {
              kind: 'or',
              terms: [
                { kind: 'controlsAtLeast', filter: SQUIRREL, count: 1 },
                { kind: 'objectMatches', of: { kind: 'moved' }, filter: SQUIRREL, inZone: 'hand' },
              ],
            },
            effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 },
          },
        ],
      },
    },
  }),
  // "Mill four cards. You may put a permanent card from among them into your hand. You gain 1 life."
  singleFace({
    name: 'SYNTHETIC Mill Four Saving',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Mill four cards. You may put a permanent card from among them into your hand. You gain 1 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          mill(4),
          takeFromMilled(PERMANENT_CARD),
          { kind: 'gainLife', player: YOU, amount: 1 },
        ],
      },
    },
  }),
  // "When this creature enters, mill four cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life."
  singleFace({
    name: 'SYNTHETIC Mill Four Greeter',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Human', 'Citizen'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'When this creature enters, mill four cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            mill(4),
            takeFromMilled({ types: ['land'] }),
            {
              kind: 'conditional',
              condition: {
                kind: 'objectMatches',
                of: { kind: 'moved' },
                filter: { subtypes: ['Town'] },
                inZone: 'hand',
              },
              effect: { kind: 'gainLife', player: YOU, amount: 2 },
            },
          ],
        },
      },
    ],
  }),
  // "Mill four cards, then you may return a permanent card from among them to your hand."
  singleFace({
    name: 'SYNTHETIC Mill Four Tilling',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Mill four cards, then you may return a permanent card from among them to your hand.',
    spell: {
      effect: { kind: 'sequence', effects: [mill(4), takeFromMilled(PERMANENT_CARD)] },
    },
  }),
  // The cards the library holds in the tests: a creature of the Squirrel type and a land of the Town type.
  singleFace({
    name: 'SYNTHETIC Squirrel Card',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Squirrel'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Town Land',
    manaCost: null,
    types: ['land'],
    subtypes: ['Town'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
];
