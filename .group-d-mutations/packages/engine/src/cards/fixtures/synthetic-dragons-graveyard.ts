/**
 * SYNTHETIC CARDS FOR ABILITIES THAT WORK FROM THE GRAVEYARD. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "As long as this card is in your graveyard and you control a Mountain, creatures you
 * control have haste.", the same for power and toughness, and "<spell>. Whenever a Dragon you control enters, you may pay {R}. If you do, return this
 * card from your graveyard to your hand." Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const MINE = { types: ['creature'], controller: 'you' } as const;

export const SYNTHETIC_DRAGONS_GRAVEYARD_LIST: readonly CardDefinition[] = [
  // "Haste. As long as this card is in your graveyard and you control a Mountain, creatures you control have haste."
  singleFace({
    name: 'SYNTHETIC Grave Spark',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Incarnation'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Haste. As long as this card is in your graveyard and you control a Mountain, creatures you control have haste.',
    abilities: [
      kw('haste'),
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: MINE },
          keyword: { kind: 'haste' },
        },
        condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Mountain'] }, count: 1 },
        functionsIn: 'graveyard',
      },
    ],
  }),
  // "As long as this card is in your graveyard and you have 20 or more life, creatures you control get +1/+0."
  singleFace({
    name: 'SYNTHETIC Grave Chorus',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      'As long as this card is in your graveyard and you have 20 or more life, creatures you control get +1/+0.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: MINE },
          power: 1,
          toughness: 0,
        },
        condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 20 } },
        functionsIn: 'graveyard',
      },
    ],
  }),
  // "~ deals 4 damage to target creature. Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard
  //  to your hand."
  singleFace({
    name: 'SYNTHETIC Ember Return',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      '~ deals 4 damage to target creature. Whenever a Dragon you control enters, you may pay {R}. If you do, return this card from your graveyard to your hand.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'dealDamage', amount: 4, to: { kind: 'target', id: 't1' } },
    },
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { subtypes: ['Dragon'], controller: 'you' },
        },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['R'] }],
          effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        },
        functionsIn: 'graveyard',
      },
    ],
  }),
  // "Flying" (a Dragon with nothing else on it)
  singleFace({
    name: 'SYNTHETIC Plain Drake',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: 'Flying.',
    abilities: [kw('flying')],
  }),
  // "Whenever a Dragon you control enters, you gain 1 life." that works from the graveyard only (a permanent that is on the battlefield
  //  does not trigger)
  singleFace({
    name: 'SYNTHETIC Grave Echo',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever a Dragon you control enters, you gain 1 life, but only while this card is in your graveyard.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { subtypes: ['Dragon'], controller: 'you' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        functionsIn: 'graveyard',
      },
    ],
  }),
];
