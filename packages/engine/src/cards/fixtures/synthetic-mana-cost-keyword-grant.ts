/**
 * SYNTHETIC CARDS FOR A KEYWORD WHOSE COST IS MADE FROM THE MANA COST. NOT REAL MAGIC CARDS.
 *
 * Invented for the scenario tests of the permanent that gives the enchantment cards of its controller's hand miracle with the cost equal to the mana cost reduced by {4}, and of the
 * one that gives the enchantment cards of its controller's graveyard escape with the cost equal to the mana cost plus exiling three other cards (`grantKeywordFromManaCost`, CR
 * 702.94a, 702.138a). Names start with "SYNTHETIC "; oracleId is null; the text describes what the AST does, it is not Oracle text, and none of these is the definition of a real
 * card (the real ones are read from their Oracle text by `packages/cards`).
 */
import type { ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const ENCHANTMENT: ObjectFilter = { types: ['enchantment'] };
const T1 = { kind: 'target', id: 't1' } as const;

export const SYNTHETIC_MANA_COST_KEYWORD_GRANT_LIST: readonly CardDefinition[] = [
  // "Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}."
  singleFace({
    name: 'SYNTHETIC Veil Seer',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 3,
    oracleText:
      'Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordFromManaCost',
          what: ENCHANTMENT,
          grant: { kind: 'miracle', reduce: 4 },
        },
      },
    ],
  }),
  // "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard."
  singleFace({
    name: 'SYNTHETIC Key Warden',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Horror'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText:
      "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordFromManaCost',
          what: ENCHANTMENT,
          grant: { kind: 'escape', exile: 3 },
        },
      },
    ],
  }),
  // An enchantment with more than {4} of generic mana in its cost.
  singleFace({
    name: 'SYNTHETIC Grand Shrine',
    manaCost: ['5', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
  // An enchantment with less than {4} of generic mana in its cost: the coloured mana is never reduced (CR 118.7a).
  singleFace({
    name: 'SYNTHETIC Small Charm',
    manaCost: ['1', 'W', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
  // An enchantment with an {X} in its mana cost (CR 107.3a).
  singleFace({
    name: 'SYNTHETIC Swelling Shrine',
    manaCost: ['X', '2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: '',
  }),
  // An enchantment that is a land: no mana cost (CR 118.6).
  singleFace({
    name: 'SYNTHETIC Shrine Field',
    manaCost: null,
    types: ['land', 'enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  // An enchantment that is no land and has no mana cost (CR 118.6, 202.1b).
  singleFace({
    name: 'SYNTHETIC Costless Shrine',
    manaCost: null,
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
  // "Return target card from a graveyard to its owner's hand.": a card put into a hand without being drawn.
  singleFace({
    name: 'SYNTHETIC Shrine Recall',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Return target card from a graveyard to its owner's hand.",
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
    },
  }),
];
