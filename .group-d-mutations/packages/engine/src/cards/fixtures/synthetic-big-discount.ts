/**
 * SYNTHETIC CARDS FOR "CREATURE SPELLS YOU CAST WITH POWER 4 OR GREATER COST {2} LESS TO CAST". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): permanents whose static ability reduces the cost of the spells a filter names by a
 * comparison of the spell's own power (and, in the second one, its mana value and its colors), with a number of generic mana. Names start
 * with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a
 * real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_BIG_DISCOUNT_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Titan Tamer',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Creature spells you cast with power 4 or greater cost {2} less to cast.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { types: ['creature'], controller: 'you', power: { cmp: 'atLeast', value: 4 } },
          amount: 2,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Small Thrift Ring',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Noncreature spells you cast with mana value 3 or less cost {1} less to cast.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: {
            notTypes: ['creature'],
            controller: 'you',
            manaValue: { cmp: 'atMost', value: 3 },
          },
          amount: 1,
        },
      },
    ],
  }),
];
