/**
 * SYNTHETIC KICKER, FLASHBACK AND CONDITIONAL-EFFECT CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Kicker (CR 702.33), Flashback (CR 702.34) and the `conditional` effect
 * (CR 608.2c). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text and none of these copies a real card's definition.
 *
 * "When this creature enters, if it was kicked, ..." is modelled as an enters trigger whose effect
 * is conditional on `kicked`: the trigger goes on the stack even for an unkicked creature and then
 * does nothing. The intervening "if" of CR 603.4, which does not trigger at all, is SYNTHETIC
 * Kicker Warden in synthetic-followups.ts.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const T1 = { kind: 'target', id: 't1' } as const;
const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;
const KICKED = { kind: 'kicked' } as const;

const draw = (count: number): Effect => ({ kind: 'draw', player: YOU, count });
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const damageTo = (amount: number): Effect => ({ kind: 'dealDamage', amount, to: T1 });

export const SYNTHETIC_KICKER_LIST: readonly CardDefinition[] = [
  // A permanent: the kicked fact moves from the spell to the permanent, where its enters trigger
  // reads it.
  singleFace({
    name: 'SYNTHETIC Kicker Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'Kicker {2}. When this creature enters, if it was kicked, put two +1/+1 counters on it.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'conditional',
          condition: KICKED,
          effect: {
            kind: 'addCounters',
            objects: { kind: 'this' },
            counter: '+1/+1',
            count: 2,
          },
        },
      },
    ],
  }),
  // The permanent can leave before its trigger resolves: "if it was kicked" then reads its
  // last-known information (CR 113.7a).
  singleFace({
    name: 'SYNTHETIC Kicker Seer',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'Kicker {1}. When this creature enters, if it was kicked, you gain 3 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'conditional', condition: KICKED, effect: gain(3) },
      },
    ],
  }),
  // A spell with a bigger effect when kicked ("instead"): the else branch is the unkicked effect.
  singleFace({
    name: 'SYNTHETIC Kicker Bolt',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {2}. This spell deals 2 damage to target creature. If this spell was kicked, it deals 4 damage instead.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'conditional', condition: KICKED, effect: damageTo(4), else: damageTo(2) },
    },
  }),
  // An instant: an extra effect only when kicked, and no else branch.
  singleFace({
    name: 'SYNTHETIC Kicker Gain',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Kicker {1}. You gain 2 life. If this spell was kicked, draw a card.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [gain(2), { kind: 'conditional', condition: KICKED, effect: draw(1) }],
      },
    },
  }),
  // A kicker cost that is life, not mana.
  singleFace({
    name: 'SYNTHETIC Life Kicker',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Kicker-Pay 3 life. Draw a card. If this spell was kicked, draw two more cards.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'payLife', amount: 3 }] } },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [draw(1), { kind: 'conditional', condition: KICKED, effect: draw(2) }],
      },
    },
  }),
  // A kicker cost with mana and life together.
  singleFace({
    name: 'SYNTHETIC Double Kicker',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Kicker {1} and pay 1 life. You gain 1 life. If this spell was kicked, draw a card.',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'kicker',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'payLife', amount: 1 },
          ],
        },
      },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [gain(1), { kind: 'conditional', condition: KICKED, effect: draw(1) }],
      },
    },
  }),
  // A conditional with no kicker at all: the condition is a count of permanents.
  singleFace({
    name: 'SYNTHETIC Rally Cry',
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'If you control two or more creatures, draw two cards. Otherwise, you gain 2 life.',
    spell: {
      effect: {
        kind: 'conditional',
        condition: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 2 },
        effect: draw(2),
        else: gain(2),
      },
    },
  }),
  // Flashback on an instant with a target.
  singleFace({
    name: 'SYNTHETIC Flash Slay',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Destroy target creature. Flashback {2}{B}.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['2', 'B'] }] },
      },
    ],
    spell: {
      targets: [CREATURE_TARGET],
      effect: { kind: 'destroy', objects: T1 },
    },
  }),
  // Flashback on a sorcery with no target: sorcery timing from the graveyard too.
  singleFace({
    name: 'SYNTHETIC Flash Study',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card. Flashback {4}{U}.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['4', 'U'] }] },
      },
    ],
    spell: { effect: draw(1) },
  }),
  // Flashback on a spell that can only be countered, so the exile-on-counter rule has a subject.
  singleFace({
    name: 'SYNTHETIC Flash Gain',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 3 life. Flashback {1}{W}.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['1', 'W'] }] },
      },
    ],
    spell: { effect: gain(3) },
  }),
  // Kicker and flashback on one card: the kicker cost is added to the flashback cost (CR 118.9d).
  singleFace({
    name: 'SYNTHETIC Kick Flash',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Kicker {1}. Deals 1 damage to each opponent. If this spell was kicked, it deals 3 damage instead. Flashback {2}{R}.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['2', 'R'] }] },
      },
    ],
    spell: {
      effect: {
        kind: 'conditional',
        condition: KICKED,
        effect: { kind: 'dealDamage', amount: 3, to: { kind: 'eachOpponent' } },
        else: { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
      },
    },
  }),
];
