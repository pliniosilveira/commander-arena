/**
 * SYNTHETIC CARDS FOR "TAP X UNTAPPED <TYPE> YOU CONTROL" AS AN EFFECT AND "DEALS X DAMAGE TO THE PLAYER OR PLANESWALKER IT'S ATTACKING"
 * (CR 701.26a, 508.1b). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): a creature that, when it attacks, may tap any number of untapped creatures of one type
 * and, if it does, gets +X/+0 and deals X damage to what it is attacking (for two different creature types), one that taps exactly two
 * untapped creatures and draws, and one that creates tokens when it enters. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;

const token = (type: string) =>
  ({
    name: type,
    manaCost: null,
    supertypes: [],
    types: ['artifact', 'creature'],
    subtypes: [type],
    colors: [],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  }) as const;

/** "Whenever this creature attacks, you may tap X untapped [type] you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking." */
const surge = (type: string): Effect => ({
  kind: 'sequence',
  effects: [
    {
      kind: 'tap',
      objects: {
        kind: 'choose',
        filter: { subtypes: [type], controller: 'you' },
        anyNumber: true,
      },
    },
    {
      kind: 'conditional',
      condition: { kind: 'didPrevious' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'modifyPt',
            objects: THIS,
            power: { kind: 'thisWay', what: 'tapped' },
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
          {
            kind: 'dealDamage',
            amount: { kind: 'thisWay', what: 'tapped' },
            to: { kind: 'attackedBy', of: THIS },
          },
        ],
      },
    },
  ],
});

const attacks = (effect: Effect): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'attacks', what: THIS },
  effect,
});

const sphere = (name: string, type: string, oracle: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['7'],
    types: ['artifact', 'creature'],
    subtypes: [type, 'Construct'],
    colors: [],
    colorIdentity: [],
    power: 4,
    toughness: 7,
    oracleText: oracle,
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: token(type) },
          count: 4,
        },
      },
      attacks(surge(type)),
    ],
  });

const CREATURE_YOU: ObjectFilter = { types: ['creature'], controller: 'you' };

const T1 = { kind: 'target', id: 't1' } as const;

/** A 1/1 artifact creature of one type with no text, to be tapped. */
const mite = (name: string, type: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['artifact', 'creature'],
    subtypes: [type],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
  });

export const SYNTHETIC_TAP_CHOICE_LIST: readonly CardDefinition[] = [
  mite('SYNTHETIC Copper Myr', 'Myr'),
  mite('SYNTHETIC Iron Mite', 'Insect'),
  sphere(
    'SYNTHETIC Swarm Sphere',
    'Myr',
    "When this creature enters, create four 1/1 colorless Myr artifact creature tokens. Whenever this creature attacks, you may tap X untapped Myr you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
  ),
  singleFace({
    name: 'SYNTHETIC Goblin Warband',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      "Whenever this creature attacks, you may tap X untapped Goblins you control. If you do, this creature gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
    abilities: [attacks(surge('Goblin'))],
  }),
  // "Whenever this creature attacks, you may tap any number of untapped creatures you control. If you do, draw a card."
  singleFace({
    name: 'SYNTHETIC Idle Scribe',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever this creature attacks, you may tap any number of untapped creatures you control. If you do, draw a card.',
    abilities: [
      attacks({
        kind: 'sequence',
        effects: [
          {
            kind: 'tap',
            objects: { kind: 'choose', filter: CREATURE_YOU, anyNumber: true },
          },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      }),
    ],
  }),
  // "{1}: Tap target creature. You gain 1 life for each creature tapped this way."
  singleFace({
    name: 'SYNTHETIC Chilling Rune',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{1}: Tap target creature. You gain 1 life for each creature tapped this way.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'tap', objects: T1 },
            {
              kind: 'gainLife',
              player: { kind: 'you' },
              amount: { kind: 'thisWay', what: 'tapped' },
            },
          ],
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Weary Drover',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Human'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever this creature attacks, tap two untapped creatures you control. If you do, draw a card.',
    abilities: [
      attacks({
        kind: 'sequence',
        effects: [
          { kind: 'tap', objects: { kind: 'choose', filter: CREATURE_YOU, count: 2 } },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      }),
    ],
  }),
];
