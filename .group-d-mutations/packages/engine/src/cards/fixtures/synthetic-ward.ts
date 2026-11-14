/**
 * SYNTHETIC WARD, COPY AND LEGEND CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of Ward (CR 702.21), token copies and "becomes a copy"
 * (CR 707.2, 613.2a) and the legend rule (CR 704.5j). Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text. None of them copies the
 * definition of a real card.
 */
import type { Ability, Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;

const ward = (cost: readonly Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'ward', cost },
});

const copyOf = (id: string) =>
  ({
    kind: 'createToken',
    token: { kind: 'copyOf', object: { kind: 'target', id } },
    count: 1,
  }) as const;

export const SYNTHETIC_WARD_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Warded Guard',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Ward {1}',
    abilities: [ward([{ kind: 'mana', symbols: ['1'] }])],
  }),
  singleFace({
    name: 'SYNTHETIC Blood Warded Guard',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Vampire'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 3,
    oracleText: 'Ward—Pay 2 life.',
    abilities: [ward([{ kind: 'payLife', amount: 2 }])],
  }),
  singleFace({
    name: 'SYNTHETIC Warded Sentinel',
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: ['Construct'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 4,
    oracleText: 'Ward {2}',
    abilities: [ward([{ kind: 'mana', symbols: ['2'] }])],
  }),
  singleFace({
    name: 'SYNTHETIC Twin Image',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Create a token that's a copy of target creature you control.",
    spell: {
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { ...CREATURE, controller: 'you' } },
        },
      ],
      effect: copyOf('t1'),
    },
  }),
  singleFace({
    name: 'SYNTHETIC Echo Image',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: "Create a token that's a copy of target creature.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
      effect: copyOf('t1'),
    },
  }),
  singleFace({
    name: 'SYNTHETIC Doppel Shift',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Target creature becomes a copy of another target creature until end of turn.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: CREATURE } },
        { id: 't2', what: { kind: 'object', filter: CREATURE } },
      ],
      effect: {
        kind: 'becomeCopy',
        objects: { kind: 'target', id: 't1' },
        of: { kind: 'target', id: 't2' },
        duration: 'untilEndOfTurn',
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Ancient Knight',
    manaCost: ['2', 'W'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Knight'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: 'When this creature dies, you gain 2 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Ancient Sage',
    manaCost: ['1', 'U'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText: 'Ward {1}',
    abilities: [ward([{ kind: 'mana', symbols: ['1'] }])],
  }),
  singleFace({
    name: 'SYNTHETIC Cloner Imp',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: "{3}: Create a token that's a copy of this creature.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3'] }],
        effect: {
          kind: 'createToken',
          token: { kind: 'copyOf', object: { kind: 'this' } },
          count: 1,
        },
      },
    ],
  }),
];
