/**
 * SYNTHETIC CARDS FOR THE SLIVER SWARM DECK (ISSUE 133), GROUP B. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Sliver lords' rule-changing statics: a permission for any player to cast spells as though they had flash. Each one has
 * the wording of a real card, the name replaced. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_SLIVER_B_LIST: readonly CardDefinition[] = [
  // "Any player may cast Sliver spells as though they had flash."
  singleFace({
    name: 'SYNTHETIC Hive Quickener',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'Any player may cast Sliver spells as though they had flash.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { subtypes: ['Sliver'] }, anyPlayer: true },
      },
    ],
  }),
  // A Sliver and a non-Sliver creature to cast with it.
  singleFace({
    name: 'SYNTHETIC Plain Sliver',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
];
