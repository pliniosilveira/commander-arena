/**
 * SYNTHETIC TURN-UP CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the triggers about turning a permanent face up and about a face-down creature entering (CR 701.40b, 708.3, 708.8, 603.2). Names start with
 * "SYNTHETIC ", oracleId is null, and the text describes what the AST does; none of this is Oracle text and none copies a real card.
 *
 * - Enchantments whose abilities watch: "Whenever you turn a permanent face up, put a +1/+1 counter on it.", "Whenever a permanent you control is turned face up, if it's a creature,
 *   you may have it fight target creature you don't control.", "... it gets +2/+2 until end of turn.", "Whenever a permanent is turned face up, you gain 1 life." (any player's),
 *   "Whenever a face-down creature you control enters, draw a card.".
 * - A creature with an ability of its own for the moment it is turned face up: "When this creature is turned face up, you gain 3 life."
 */
import type { Ability, Effect, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const IT = { kind: 'triggerSubject' } as const;
const CREATURE_YOU_CONTROL: ObjectFilter = { types: ['creature'], controller: 'you' };

const watcher = (name: string, text: string, ability: Ability): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: text,
    abilities: [ability],
  });

const turnedUp = (effect: Effect, extra: Partial<Extract<Ability, { kind: 'triggered' }>> = {}) =>
  ({
    kind: 'triggered',
    trigger: { kind: 'turnedFaceUp', what: { controller: 'you' } },
    effect,
    ...extra,
  }) satisfies Ability;

export const SYNTHETIC_TURN_UP_LIST: readonly CardDefinition[] = [
  watcher(
    'SYNTHETIC Turn-Up Grower',
    'Whenever you turn a permanent face up, put a +1/+1 counter on it.',
    {
      kind: 'triggered',
      trigger: { kind: 'turnedFaceUp', what: {}, by: 'you' },
      effect: {
        kind: 'addCounters',
        objects: IT,
        counter: '+1/+1',
        count: 1,
      },
    },
  ),
  watcher(
    'SYNTHETIC Turn-Up Fighter',
    "Whenever a permanent you control is turned face up, if it's a creature, you may have it fight target creature you don't control.",
    turnedUp(
      { kind: 'fight', fighters: IT, against: { kind: 'target', id: 't1' } },
      {
        optional: true,
        interveningIf: { kind: 'subjectMatches', filter: { types: ['creature'] } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
          },
        ],
      },
    ),
  ),
  watcher(
    'SYNTHETIC Turn-Up Pumper',
    "Whenever a permanent you control is turned face up, if it's a creature, it gets +2/+2 until end of turn.",
    turnedUp(
      { kind: 'modifyPt', objects: IT, power: 2, toughness: 2, duration: 'untilEndOfTurn' },
      { interveningIf: { kind: 'subjectMatches', filter: { types: ['creature'] } } },
    ),
  ),
  watcher('SYNTHETIC Turn-Up Gain', 'Whenever a permanent is turned face up, you gain 1 life.', {
    kind: 'triggered',
    trigger: { kind: 'turnedFaceUp', what: {} },
    effect: { kind: 'gainLife', player: YOU, amount: 1 },
  }),
  watcher(
    'SYNTHETIC Face-Down Draw',
    'Whenever a face-down creature you control enters, draw a card.',
    {
      kind: 'triggered',
      trigger: {
        kind: 'entersBattlefield',
        what: { ...CREATURE_YOU_CONTROL, isFaceDown: true },
      },
      effect: { kind: 'draw', player: YOU, count: 1 },
    },
  ),
  // "When this creature is turned face up, you gain 3 life."
  singleFace({
    name: 'SYNTHETIC Turn-Up Self',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'When this creature is turned face up, you gain 3 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: YOU, amount: 3 },
      },
    ],
  }),
];
