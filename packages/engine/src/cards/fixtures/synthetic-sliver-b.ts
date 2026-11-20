/**
 * SYNTHETIC CARDS FOR THE SLIVER SWARM DECK (ISSUE 133), GROUP B. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Sliver lords' rule-changing statics: a permission for any player to cast spells as though they had flash, and a Replicate given to
 * the spells a permanent's controller casts, the legend rule that does not apply to some permanents, a creature type given to groups of creatures, and Encore given to the cards of a graveyard. Each one has
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
  // "The "legend rule" doesn't apply to Slivers you control."
  singleFace({
    name: 'SYNTHETIC Hive Warden',
    manaCost: ['W', 'U', 'B', 'R', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    power: 3,
    toughness: 3,
    oracleText: 'The "legend rule" doesn\'t apply to Slivers you control.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'legendRuleDoesntApply',
          what: { subtypes: ['Sliver'], controller: 'you' },
        },
      },
    ],
  }),
  // A legendary Sliver and a legendary non-Sliver, for the duplicates.
  singleFace({
    name: 'SYNTHETIC Legend Sliver',
    manaCost: ['2'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Legend Drone',
    manaCost: ['2'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Insect'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "As this enters, choose a creature type. Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is
  // true for creature spells you control and creature cards you own that aren't on the battlefield."
  singleFace({
    name: 'SYNTHETIC Hive Biologist',
    manaCost: ['W', 'U', 'B', 'R', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    power: 3,
    toughness: 3,
    oracleText:
      "As this enters, choose a creature type.\nSlivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own that aren't on the battlefield.",
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'giveChosenCreatureType',
          what: {
            anyOf: [
              { subtypes: ['Sliver'], controller: 'you' },
              { types: ['creature'], token: false, controller: 'you' },
            ],
          },
          alsoCardsAndSpells: true,
        },
      },
    ],
  }),
  // "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value."
  singleFace({
    name: 'SYNTHETIC Hive Gravekeeper',
    manaCost: ['W', 'U', 'B', 'R', 'G'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Sliver'],
    colors: ['W', 'U', 'B', 'R', 'G'],
    colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    power: 6,
    toughness: 6,
    oracleText:
      'Each Sliver creature card in your graveyard has encore {X}, where X is its mana value.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantEncoreToGraveyardCards',
          what: { types: ['creature'], subtypes: ['Sliver'] },
        },
      },
    ],
  }),
];
