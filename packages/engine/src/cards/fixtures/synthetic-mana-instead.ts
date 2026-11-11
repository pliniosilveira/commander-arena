/**
 * SYNTHETIC CARDS FOR MANA ABILITIES THAT MAKE SOMETHING ELSE WHILE A CONDITION HOLDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): a creature whose {T} ability adds one mana of any color, or two mana of any one
 * color instead while its controller controls a creature with power 4 or greater (`ManaAbility.instead`, `anyColor` with a `count`), a
 * rock that adds {G} or {G}{G} instead with three or more lands, and a creature that adds two mana of any one color always. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a
 * real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_MANA_INSTEAD_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Doubling Mystic',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Druid'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      '{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColor' },
        instead: {
          condition: {
            kind: 'controlsAtLeast',
            filter: { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
            count: 1,
          },
          production: { kind: 'anyColor', count: 2 },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Rich Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. If you control three or more lands, add {G}{G} instead.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G'] },
        instead: {
          condition: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 3 },
          production: { kind: 'fixed', mana: ['G', 'G'] },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Chameleon Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Add {C}. If you control three or more lands, add one mana of any color instead.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['C'] },
        instead: {
          condition: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 3 },
          production: { kind: 'anyColor' },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Twin Spring',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add two mana of any one color.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColor', count: 2 } },
    ],
  }),
];
