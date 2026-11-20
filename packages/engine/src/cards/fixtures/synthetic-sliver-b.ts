/**
 * SYNTHETIC CARDS FOR THE SLIVER SWARM DECK (ISSUE 133), GROUP B. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Sliver lords' rule-changing statics: a permission for any player to cast spells as though they had flash, and a Replicate given to
 * the spells a permanent's controller casts. Each one has
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
  // "Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost."
  singleFace({
    name: 'SYNTHETIC Hive Replicator',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: { subtypes: ['Sliver'], controller: 'you' },
          keyword: { kind: 'replicateAtManaCost' },
        },
      },
    ],
  }),
  // A Sliver with a mana cost of two colors of mana, and one with {X}.
  singleFace({
    name: 'SYNTHETIC Costly Sliver',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Variable Sliver',
    manaCost: ['X', 'G'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '',
  }),
];
