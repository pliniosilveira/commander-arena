/**
 * SYNTHETIC CARDS FOR GROUP 1 OF THE HYLDA DECK (issue 42, D-510 to D-516). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a creature that makes a modal reflexive ability when its controller pays after they tap an untapped creature of an opponent, a creature that taps with a
 * paid reflexive ability when it attacks and grows when its controller taps an untapped creature of an opponent, a creature that taps and stuns on entering and draws once each
 * turn when its controller taps untapped creatures of the opponents, an enchantment that draws when a creature of an opponent becomes tapped but not as an attacker, a creature that
 * taps up to one creature of each opponent when it attacks, a creature that taps up to as many permanents as it scried cards, a creature that gives protection from a card type
 * of its controller's choice, and three helpers that tap (one creature, every creature of the opponents, two creatures).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter, SpellMode, TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const END = 'untilEndOfTurn' as const;

/** "A 4/4 white and blue Elemental creature token". */
const ELEMENTAL: TokenDefinition = {
  name: 'Elemental',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['W', 'U'],
  power: 4,
  toughness: 4,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
};

/** "An untapped creature an opponent controls" is any creature of the opponents: the event is the change from untapped to tapped. */
const OPPONENT_CREATURE: ObjectFilter = { types: ['creature'], controller: 'opponent' };

const TAP_TARGET_OPPONENT_CREATURE = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
  },
} as const;

/** "You may pay {1}. When you do, choose one — ..." (the three modes of the real card). */
const HYLDA_MODES: readonly SpellMode[] = [
  {
    text: 'Create a 4/4 white and blue Elemental creature token.',
    effect: { kind: 'createToken', token: { kind: 'custom', definition: ELEMENTAL }, count: 1 },
  },
  {
    text: 'Put a +1/+1 counter on each creature you control.',
    effect: {
      kind: 'addCounters',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      },
      counter: '+1/+1',
      count: 1,
    },
  },
  {
    text: 'Scry 2, then draw a card.',
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'scry', count: 2 },
        { kind: 'draw', player: YOU, count: 1 },
      ],
    },
  },
];

export const SYNTHETIC_HYLDA_G1_LIST: readonly CardDefinition[] = [
  // "Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one —
  //  • Create a 4/4 white and blue Elemental creature token. • Put a +1/+1 counter on each creature you control. • Scry 2, then draw a card."
  singleFace({
    name: 'SYNTHETIC Frost Warlock',
    manaCost: ['2', 'W', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Warlock'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    power: 3,
    toughness: 4,
    oracleText:
      'Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one —\n• Create a 4/4 white and blue Elemental creature token.\n• Put a +1/+1 counter on each creature you control.\n• Scry 2, then draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you' },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: {
            kind: 'reflexive',
            afterPayment: true,
            effect: { kind: 'sequence', effects: [] },
            chooseModes: { min: 1, max: 1 },
            modes: HYLDA_MODES,
          },
        },
      },
    ],
  }),
  // "Vigilance
  //  Whenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls.
  //  Whenever you tap an untapped creature an opponent controls, this creature gets +2/+1 until end of turn."
  singleFace({
    name: 'SYNTHETIC Chill Sentry',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Elemental', 'Soldier'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 3,
    oracleText:
      'Vigilance\nWhenever this creature attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls.\nWhenever you tap an untapped creature an opponent controls, this creature gets +2/+1 until end of turn.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['1', 'U'] }],
          effect: {
            kind: 'reflexive',
            afterPayment: true,
            targets: [TAP_TARGET_OPPONENT_CREATURE],
            effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you' },
        effect: { kind: 'modifyPt', objects: THIS, power: 2, toughness: 1, duration: END },
      },
    ],
  }),
  // "When this creature enters, tap target creature an opponent controls and put a stun counter on it.
  //  Whenever you tap one or more untapped creatures your opponents control, draw a card. This ability triggers only once each turn."
  singleFace({
    name: 'SYNTHETIC Numbing Merfolk',
    manaCost: ['2', 'W', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Merfolk', 'Wizard'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    power: 2,
    toughness: 3,
    oracleText:
      'When this creature enters, tap target creature an opponent controls and put a stun counter on it.\nWhenever you tap one or more untapped creatures your opponents control, draw a card. This ability triggers only once each turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [TAP_TARGET_OPPONENT_CREATURE],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'tap', objects: { kind: 'target', id: 't1' } },
            {
              kind: 'addCounters',
              objects: { kind: 'target', id: 't1' },
              counter: 'stun',
              count: 1,
            },
          ],
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you', batch: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
        oncePerTurn: true,
      },
    ],
  }),
  // "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, you may draw a card.
  //  {4}{U}: Tap target creature without flying."
  singleFace({
    name: 'SYNTHETIC Watchful Circle',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, you may draw a card.\n{4}{U}: Tap target creature without flying.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, notAsAttacker: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
        optional: true,
      },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['4', 'U'] }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], notKeywords: ['flying'] },
            },
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Whenever this creature attacks, for each opponent, tap up to one target creature that player controls."
  singleFace({
    name: 'SYNTHETIC Hammer Dwarf',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Dwarf', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever this creature attacks, for each opponent, tap up to one target creature that player controls.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
            onePerOpponent: true,
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Whenever this creature attacks, scry 1.
  //  Whenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way."
  singleFace({
    name: 'SYNTHETIC Tide Pilot',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Elf', 'Pilot'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 2,
    oracleText:
      'Whenever this creature attacks, scry 1.\nWhenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: { kind: 'scry', count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'scries', who: 'you' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
            upToTriggerAmount: true,
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ],
  }),
  // "Vigilance, ward {1}
  //  {T}: Another target creature you control gains protection from the card type of your choice until end of turn."
  singleFace({
    name: 'SYNTHETIC Citadel Halfling',
    manaCost: ['W', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Halfling', 'Soldier'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    power: 2,
    toughness: 2,
    oracleText:
      'Vigilance, ward {1}\n{T}: Another target creature you control gains protection from the card type of your choice until end of turn.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'vigilance' } },
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you', other: true },
            },
          },
        ],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'target', id: 't1' },
          keyword: { kind: 'protection', from: 'cardTypeOfChoice' },
          duration: END,
        },
      },
    ] satisfies Ability[],
  }),
  // "Tap target creature." (an instant that taps one creature: a tap by the effect of its controller)
  singleFace({
    name: 'SYNTHETIC Frost Touch',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Tap target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
    },
  }),
  // "Tap all creatures your opponents control." (one effect taps several creatures at once)
  singleFace({
    name: 'SYNTHETIC Tidal Hush',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Tap all creatures your opponents control.',
    spell: {
      effect: {
        kind: 'tap',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
      },
    },
  }),
  // "Scry 2." (a scry that is not a creature's attack)
  singleFace({
    name: 'SYNTHETIC Clear Sight',
    manaCost: ['U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Scry 2.',
    spell: { effect: { kind: 'scry', count: 2 } },
  }),
];
