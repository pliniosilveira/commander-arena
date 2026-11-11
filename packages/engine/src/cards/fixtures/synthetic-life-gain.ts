/**
 * SYNTHETIC CARDS FOR GAINING LIFE AND COUNTERS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): "If you would gain life, you gain that much life plus N instead" with
 * "+2/+2 as long as you have 25 or more life", "Whenever you gain life [for the first time each turn], ..." (a surveil, a ping, a
 * +1/+1 counter), "Whenever you put one or more +1/+1 counters on this creature, draw a card. This ability triggers only once each
 * turn", and spells that gain life or put counters. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** The colors the symbols of a mana cost name, in the order W, U, B, R, G. */
const colorsOf = (cost: readonly string[]): ('W' | 'U' | 'B' | 'R' | 'G')[] =>
  (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => cost.includes(c));

const angel = (
  name: string,
  cost: readonly string[],
  power: number,
  toughness: number,
  abilities: readonly Ability[],
  words: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: [...cost],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: colorsOf(cost),
    colorIdentity: colorsOf(cost),
    power,
    toughness,
    oracleText: words,
    abilities: [...abilities],
  });

export const SYNTHETIC_LIFE_GAIN_LIST: readonly CardDefinition[] = [
  // "If you would gain life, you gain that much life plus 1 instead. This creature gets +2/+2 as long as you have 25 or more life."
  angel(
    'SYNTHETIC Vital Angel',
    ['2', 'W'],
    2,
    2,
    [
      kw('flying'),
      { kind: 'replacement', replacement: { kind: 'lifeGainBonus', amount: 1 } },
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'this' }, power: 2, toughness: 2 },
        condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 25 } },
      },
    ],
    'Flying. If you would gain life, you gain that much life plus 1 instead. This creature gets +2/+2 as long as you have 25 or more life.',
  ),
  // The same replacement with a different number, to show the amount is read from the card.
  angel(
    'SYNTHETIC Radiant Angel',
    ['3', 'W'],
    2,
    2,
    [{ kind: 'replacement', replacement: { kind: 'lifeGainBonus', amount: 3 } }],
    'If you would gain life, you gain that much life plus 3 instead.',
  ),
  // "Whenever you gain life for the first time each turn, surveil 1."
  angel(
    'SYNTHETIC Seer Seraph',
    ['3', 'W'],
    3,
    3,
    [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you', firstEachTurn: true },
        effect: { kind: 'surveil', count: 1 },
      },
    ],
    'Flying. Whenever you gain life for the first time each turn, surveil 1.',
  ),
  // "Whenever you gain life for the first time each turn, each opponent loses 1 life." (the same trigger with an effect that needs no question)
  angel(
    'SYNTHETIC Dawn Pinger',
    ['2', 'W'],
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you', firstEachTurn: true },
        effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
      },
    ],
    'Whenever you gain life for the first time each turn, each opponent loses 1 life.',
  ),
  // "Whenever a player gains life, you lose 1 life." (any player, every gain)
  angel(
    'SYNTHETIC Envious Angel',
    ['2', 'B'],
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'any' },
        effect: { kind: 'loseLife', player: YOU, amount: 1 },
      },
    ],
    'Whenever a player gains life, you lose 1 life.',
  ),
  // "Whenever an opponent gains life, you draw a card."
  angel(
    'SYNTHETIC Watchful Angel',
    ['2', 'U'],
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'opponent' },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
    'Whenever an opponent gains life, you draw a card.',
  ),
  // "Whenever you gain life, put a +1/+1 counter on this creature. Whenever you put one or more +1/+1 counters on this creature, draw a card.
  //  This ability triggers only once each turn."
  angel(
    'SYNTHETIC Growing Light',
    ['2', 'W', 'W'],
    3,
    3,
    [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'countersAdded', what: THIS, counter: '+1/+1', by: 'you' },
        effect: { kind: 'draw', player: YOU, count: 1 },
        oncePerTurn: true,
      },
    ],
    'Flying. Whenever you gain life, put a +1/+1 counter on this creature. Whenever you put one or more +1/+1 counters on this creature, draw a card. This ability triggers only once each turn.',
  ),
  // "Whenever you put one or more counters on a creature you control, you gain 1 life." (any kind, any creature of yours)
  angel(
    'SYNTHETIC Counter Admirer',
    ['2', 'W'],
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'countersAdded',
          what: { types: ['creature'], controller: 'you' },
          by: 'you',
        },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
    'Whenever you put one or more counters on a creature you control, you gain 1 life.',
  ),
  // "Whenever one or more +1/+1 counters are put on a creature, each opponent loses 1 life." (whoever puts them)
  angel(
    'SYNTHETIC Counter Collector',
    ['2', 'B'],
    1,
    1,
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'countersAdded',
          what: { types: ['creature'] },
          counter: '+1/+1',
          by: 'any',
        },
        effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
      },
    ],
    'Whenever one or more +1/+1 counters are put on a creature, each opponent loses 1 life.',
  ),
  // "At the beginning of your end step, if you gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying." (D-252)
  singleFace({
    name: 'SYNTHETIC Dawn Aerie',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'At the beginning of your end step, if you gained 3 or more life this turn, create a 2/2 white Griffin creature token with flying.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 3 },
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Griffin',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Griffin'],
              colors: ['W'],
              power: 2,
              toughness: 2,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [kw('flying')],
            },
          },
        },
      },
    ],
  }),
  // ---- spells
  singleFace({
    name: 'SYNTHETIC Mend',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 3 life.',
    spell: { effect: { kind: 'gainLife', player: YOU, amount: 3 } },
  }),
  singleFace({
    name: 'SYNTHETIC Mend Twice',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 2 life. You gain 2 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife', player: YOU, amount: 2 },
          { kind: 'gainLife', player: YOU, amount: 2 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Mend Nothing',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain 0 life.',
    spell: { effect: { kind: 'gainLife', player: YOU, amount: 0 } },
  }),
  singleFace({
    name: 'SYNTHETIC Mend Them',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Target opponent gains 2 life.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: { kind: 'gainLife', player: { kind: 'target', id: 't1' }, amount: 2 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Counter Boon',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Put two +1/+1 counters on target creature.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 2 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Rot Boon',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Put a -1/-1 counter on target creature.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
      effect: { kind: 'addCounters', objects: T1, counter: '-1/-1', count: 1 },
    },
  }),
];
