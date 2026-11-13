/**
 * SYNTHETIC CARDS FOR THE DANITHA DECK (ISSUE 26), GROUP 5 (D-1250 TO D-1259). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of four small primitives: a search that is followed by "then shuffle and put that card on top" (D-1250), an Aura
 * that attaches itself to a creature that enters (D-1251), a "blight N" cost of an activated ability (D-1252) with "can't attack or block"
 * on the enchanted creature, and a spell that has flash only if it targets a commander (D-1253). Each one has the wording of a real card, the
 * name replaced. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of
 * these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_DANITHA_G5_LIST: readonly CardDefinition[] = [
  // "Other enchantments you control have shroud. {1}, Sacrifice this enchantment: Search your library for an enchantment card, reveal it, then shuffle and put that card on top."
  singleFace({
    name: 'SYNTHETIC Grove Warden',
    manaCost: ['G', 'W'],
    types: ['enchantment'],
    colors: ['G', 'W'],
    colorIdentity: ['G', 'W'],
    oracleText:
      'Other enchantments you control have shroud.\n{1}, Sacrifice this enchantment: Search your library for an enchantment card, reveal it, then shuffle and put that card on top.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['enchantment'], controller: 'you' },
            other: true,
          },
          keyword: { kind: 'shroud' },
        },
      },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['enchantment'] },
          max: 1,
          destinations: [{ zone: 'library', count: 1 }],
          reveal: true,
          shuffle: true,
        },
      },
    ],
  }),
  // "Search your library for a card, then shuffle and put that card on top." (no reveal)
  singleFace({
    name: 'SYNTHETIC Quiet Tutor',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Search your library for a card, then shuffle and put that card on top.',
    spell: {
      effect: {
        kind: 'search',
        player: { kind: 'you' },
        filter: {},
        max: 1,
        destinations: [{ zone: 'library', count: 1 }],
        reveal: false,
        shuffle: true,
      },
    },
  }),
  // "You may cast this spell as though it had flash if it targets a commander. Enchant creature. Enchanted creature has indestructible."
  singleFace({
    name: 'SYNTHETIC Warding Aura',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'You may cast this spell as though it had flash if it targets a commander.\nEnchant creature\nEnchanted creature has indestructible.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { kind: 'this' } },
        condition: { kind: 'spellTargets', filter: { commander: true } },
      },
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'indestructible' },
        },
      },
    ],
  }),
  // "You may cast this spell as though it had flash if you control two or more creatures." (a flash condition that is not about the targets: engine only, the grammar does not read it)
  singleFace({
    name: 'SYNTHETIC Crowd Aura',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'You may cast this spell as though it had flash if you control two or more creatures.\nEnchant creature\nEnchanted creature has indestructible.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { kind: 'this' } },
        condition: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 2 },
      },
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'indestructible' },
        },
      },
    ],
  }),
  // "Enchant creature. Enchanted creature has indestructible. Whenever a creature enters, you may attach this Aura to that creature."
  singleFace({
    name: 'SYNTHETIC Wandering Aura',
    manaCost: ['1', 'W', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Enchant creature\nEnchanted creature has indestructible.\nWhenever a creature enters, you may attach this Aura to that creature.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'indestructible' },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
        effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'triggerSubject' } },
        optional: true,
      },
    ],
  }),
  // "Enchant creature you control. Whenever a creature enters, you may attach this Aura to that creature." (the Aura can enchant only the controller's creatures)
  singleFace({
    name: 'SYNTHETIC Loyal Wanderer',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Enchant creature you control\nWhenever a creature enters, you may attach this Aura to that creature.',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'enchant', filter: { types: ['creature'], controller: 'you' } },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
        effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'triggerSubject' } },
        optional: true,
      },
    ],
  }),
  // "Enchant creature. Enchanted creature can't attack or block. {1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature."
  singleFace({
    name: 'SYNTHETIC Blighting Aura',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Enchant creature\nEnchanted creature can't attack or block.\n{1}{W}, Blight 1, Sacrifice this Aura: Exile enchanted creature.",
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'attached', types: ['creature'] },
          restriction: 'cantAttack',
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'attached', types: ['creature'] },
          restriction: 'cantBlock',
        },
      },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'W'] },
          { kind: 'blight', count: 1 },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: { kind: 'exile', objects: { kind: 'attached' } },
      },
    ],
  }),
  // "{T}, Blight 2: Draw a card." (a blight of two counters, and one that taps the source)
  singleFace({
    name: 'SYNTHETIC Blight Scholar',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'] as never,
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 4,
    oracleText: '{T}, Blight 2: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, { kind: 'blight', count: 2 }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
];
