/**
 * SYNTHETIC CARDS FOR THE DANITHA DECK (ISSUE 26), GROUP 6 (D-1260 TO D-1269, PROVISIONAL). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of base power and keyword counters: a batch combat damage trigger over creatures "each with power greater than its base
 * power" (D-1261), spells that put a +1/+1 counter and keyword counters on a creature (D-1260), and a spell that destroys a creature with power
 * greater than its base power. Each has the wording of a real card, the name replaced. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

export const SYNTHETIC_DANITHA_G6_LIST: readonly CardDefinition[] = [
  // "Whenever one or more creatures you control each with power greater than its base power deal combat damage to a player, draw a card."
  singleFace({
    name: 'SYNTHETIC Base Power Batch Watcher',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Whenever one or more creatures you control each with power greater than its base power deal combat damage to a player, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'combatDamageBatch',
          what: { types: ['creature'], controller: 'you', powerAboveBase: true },
          to: 'player',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "Whenever a creature you control with power greater than its base power dies, you gain 1 life." (a look-back trigger: the power and the base power it had)
  singleFace({
    name: 'SYNTHETIC Surge Mourner',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Whenever a creature you control with power greater than its base power dies, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], controller: 'you', powerAboveBase: true },
        },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it."
  singleFace({
    name: 'SYNTHETIC Viper Boon',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
          { kind: 'addCounters', objects: T1, counter: 'reach', count: 1 },
          { kind: 'addCounters', objects: T1, counter: 'deathtouch', count: 1 },
          { kind: 'untap', objects: T1 },
        ],
      },
    },
  }),
  // "Put a flying counter, a first strike counter, and a double strike counter on target creature." (keyword counters of two words)
  singleFace({
    name: 'SYNTHETIC Strike Boon',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Put a flying counter, a first strike counter, and a double strike counter on target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: T1, counter: 'flying', count: 1 },
          { kind: 'addCounters', objects: T1, counter: 'first strike', count: 1 },
          { kind: 'addCounters', objects: T1, counter: 'double strike', count: 1 },
        ],
      },
    },
  }),
  // "Put two exalted counters on target creature." (each counter is an instance of exalted)
  singleFace({
    name: 'SYNTHETIC Exalting Boon',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Put two exalted counters on target creature.',
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'addCounters', objects: T1, counter: 'exalted', count: 2 },
    },
  }),
  // "Destroy target creature with power greater than its base power."
  singleFace({
    name: 'SYNTHETIC Overgrowth Snare',
    manaCost: ['1', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Destroy target creature with power greater than its base power.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], powerAboveBase: true },
          },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
];
