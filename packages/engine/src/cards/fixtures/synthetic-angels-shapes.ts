/**
 * SYNTHETIC CARDS FOR THE SHAPES THE ORACLE PARSER MUST WRITE FOR THE ANGELS DECK THAT NEED NO NEW PRIMITIVE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice). They pin, with the engine's existing primitives, the AST the parser writes for
 * "Exile target artifact, enchantment, or creature with power 4 or greater", "When this creature enters, exile up to two target
 * artifacts and/or enchantments" with Plainscycling, an Aura that gives +4/+4, flying, first strike and a creature type and returns
 * itself to its owner's hand when the enchanted creature dies, and "Whenever another permanent you control leaves the battlefield, if
 * it had counters on it, investigate". Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const THIS_CARD = { kind: 'thisCard' } as const;

export const SYNTHETIC_ANGELS_SHAPES_LIST: readonly CardDefinition[] = [
  // A plain enchantment with no abilities, a target for the exile spells.
  singleFace({
    name: 'SYNTHETIC Quiet Shrine',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
  // "Exile target artifact, enchantment, or creature with power 4 or greater."
  singleFace({
    name: 'SYNTHETIC Banishing Light Sorcery',
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Exile target artifact, enchantment, or creature with power 4 or greater.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              anyOf: [
                { types: ['artifact'] },
                { types: ['enchantment'] },
                { types: ['creature'], power: { cmp: 'atLeast', value: 4 } },
              ],
            },
          },
        },
      ],
      effect: { kind: 'exile', objects: T1 },
    },
  }),
  // "Flying. When this creature enters, exile up to two target artifacts and/or enchantments. Plainscycling {2}"
  singleFace({
    name: 'SYNTHETIC Ruin Angel',
    manaCost: ['5', 'W', 'W'],
    types: ['artifact', 'creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 5,
    toughness: 7,
    oracleText:
      'Flying. When this creature enters, exile up to two target artifacts and/or enchantments. Plainscycling {2}',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            min: 0,
            max: 2,
            what: {
              kind: 'object',
              filter: { anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }] },
            },
          },
        ],
        effect: { kind: 'exile', objects: T1 },
      },
      {
        kind: 'keyword',
        keyword: {
          kind: 'typecycling',
          filter: { subtypes: ['Plains'] },
          cost: [{ kind: 'mana', symbols: ['2'] }],
        },
      },
    ],
  }),
  // "Enchant creature. Enchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types.
  //  When enchanted creature dies, return this card to its owner's hand."
  singleFace({
    name: 'SYNTHETIC Angelic Mantle',
    manaCost: ['2', 'W', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Enchant creature. Enchanted creature gets +4/+4, has flying and first strike, and is an Angel in addition to its other types. When enchanted creature dies, return this card to its owner's hand.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power: 4,
          toughness: 4,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'flying' },
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'firstStrike' },
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: { kind: 'attached', types: ['creature'] },
          subtypes: ['Angel'],
          additive: true,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        effect: { kind: 'moveToZone', objects: THIS_CARD, to: 'hand' },
      },
    ],
  }),
  // "Flying. Whenever another permanent you control leaves the battlefield, if it had counters on it, investigate."
  singleFace({
    name: 'SYNTHETIC Counter Sleuth',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Angel', 'Advisor'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 3,
    oracleText:
      'Flying. Whenever another permanent you control leaves the battlefield, if it had counters on it, investigate.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: {
          kind: 'leavesBattlefield',
          what: { controller: 'you', other: true, hasCounter: true },
        },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' }, count: 1 },
      },
    ],
  }),
];
