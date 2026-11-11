/**
 * SYNTHETIC KEYWORD CARDS: FLASH, HEXPROOF AND SHROUD. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of CR 702.8 (Flash), CR 702.11 (Hexproof), CR 702.18 (Shroud) and
 * CR 608.2b (Resolving Spells and Abilities). Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const CREATURE_TARGET = {
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

export const SYNTHETIC_TARGETING_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Flash Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Flash',
    abilities: [kw('flash')],
  }),
  singleFace({
    name: 'SYNTHETIC Flash Trinket',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Flash',
    abilities: [kw('flash')],
  }),
  singleFace({
    name: 'SYNTHETIC Hexproof Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Hexproof',
    abilities: [kw('hexproof')],
  }),
  singleFace({
    name: 'SYNTHETIC Shroud Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Shroud',
    abilities: [kw('shroud')],
  }),
  // A creature that is hexproof and has flash: both keywords on one object.
  singleFace({
    name: 'SYNTHETIC Flash Hexproof Wisp',
    manaCost: ['U'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'Flash. Hexproof',
    abilities: [kw('flash'), kw('hexproof')],
  }),
  singleFace({
    name: 'SYNTHETIC Twin Bolt',
    manaCost: ['R', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Deals 3 damage to target creature and 3 damage to another target creature.',
    spell: {
      targets: [
        { id: 't1', ...CREATURE_TARGET },
        { id: 't2', ...CREATURE_TARGET },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } },
          { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't2' } },
        ],
      },
    },
  }),
];
