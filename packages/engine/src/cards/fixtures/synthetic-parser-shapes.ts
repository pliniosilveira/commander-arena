/**
 * SYNTHETIC CARDS FOR THE SHAPES THE ORACLE PARSER MUST WRITE FOR THE DINOSAURS DECK. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice). They pin, with the engine's existing primitives, the AST that the parser writes
 * for card texts of that deck that need no new primitive: exile a target card of any graveyard and do more "if it was a creature card",
 * "put X +1/+1 counters on target creature, where X is that creature's power" with an end step draw for the creature with the greatest
 * power, "Another target creature gets +2/+0 and gains trample until end of turn", "put a +1/+1 counter on each of up to two target
 * creatures", and an attack trigger that pumps every creature of a power. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;
const BIG: ObjectFilter = {
  types: ['creature'],
  controller: 'you',
  power: { cmp: 'atLeast', value: 4 },
};

const creature = (
  name: string,
  cost: readonly string[],
  power: number,
  toughness: number,
  abilities: readonly Ability[],
  words: string,
  subtypes: readonly string[] = [],
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...cost],
    types: ['creature'],
    subtypes: [...subtypes],
    colors: ['G'],
    colorIdentity: ['G'],
    power,
    toughness,
    oracleText: words,
    abilities: [...abilities],
  });

export const SYNTHETIC_PARSER_SHAPES_LIST: readonly CardDefinition[] = [
  creature(
    'SYNTHETIC Graveyard Scavenger',
    ['1', 'G'],
    2,
    2,
    [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['G'] }],
        targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: T1 },
            {
              kind: 'conditional',
              condition: { kind: 'objectMatches', of: T1, filter: { types: ['creature'] } },
              effect: {
                kind: 'sequence',
                effects: [
                  { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
                  { kind: 'gainLife', player: YOU, amount: 1 },
                ],
              },
            },
          ],
        },
      },
    ],
    '{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life.',
    ['Ooze'],
  ),
  creature(
    'SYNTHETIC Thicket Growth',
    ['3', 'G'],
    3,
    3,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
        effect: {
          kind: 'addCounters',
          objects: T1,
          counter: '+1/+1',
          count: { kind: 'powerOf', of: T1 },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'controlsGreatest',
            filter: { types: ['creature'] },
            stat: 'power',
          },
          effect: { kind: 'draw', player: YOU, count: 2 },
        },
      },
    ],
    "When this creature enters, put X +1/+1 counters on target creature, where X is that creature's power. At the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for it.",
    ['Plant'],
  ),
  creature(
    'SYNTHETIC Trampling Sage',
    ['3', 'G'],
    4,
    4,
    [
      { kind: 'keyword', keyword: { kind: 'deathtouch' } },
      { kind: 'keyword', keyword: { kind: 'indestructible' } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2', 'G'] }],
        targets: [
          { id: 't1', what: { kind: 'object', filter: { types: ['creature'], other: true } } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'modifyPt', objects: T1, power: 2, toughness: 0, duration: 'untilEndOfTurn' },
            {
              kind: 'grantKeyword',
              objects: T1,
              keyword: { kind: 'trample' },
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    ],
    'Deathtouch, indestructible. {2}{G}: Another target creature gets +2/+0 and gains trample until end of turn.',
    ['Dinosaur'],
  ),
  creature(
    'SYNTHETIC Counter Mentor',
    ['2', 'G'],
    2,
    2,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { types: ['creature'] } },
            min: 0,
            max: 2,
          },
        ],
        effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
      },
    ],
    'When this creature enters, put a +1/+1 counter on each of up to two target creatures.',
    ['Human'],
  ),
  creature(
    'SYNTHETIC Surging Brute',
    ['4', 'G'],
    5,
    5,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'modifyPt',
              objects: { kind: 'each', filter: BIG },
              power: 1,
              toughness: 1,
              duration: 'untilEndOfTurn',
            },
            {
              kind: 'grantKeyword',
              objects: { kind: 'each', filter: BIG },
              keyword: { kind: 'trample' },
              duration: 'untilEndOfTurn',
            },
          ],
        },
      },
    ],
    'Whenever this creature attacks, each creature you control with power 4 or greater gets +1/+1 and gains trample until end of turn.',
    ['Dinosaur'],
  ),
];
