/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE DANITHA DECK (issue 26, D-1230 to D-1233 provisional). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): a creature that counts the Auras attached to it, an Aura that counts the Auras its controller has on creatures (and draws that many cards as it enters), a
 * sorcery that destroys the creatures that aren't enchanted, an Aura that counts enchantments and gives first strike, an Aura that gives more while another Aura is on the same
 * creature, an Aura that reads the color of the creature, an Aura that gives hexproof only the turn it entered, and an Aura that cheapens Equip abilities and Aura spells that target
 * the creature it enchants. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a
 * real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const ENCHANT_CREATURE: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};
const HOST = { kind: 'attached', types: ['creature'] } as const;
/** "it" after a condition about the enchanted creature: the permanent the Aura is attached to, whatever it is (the Aura's own Enchant ability limits it, CR 303.4m). */
const ATTACHED = { kind: 'attached' } as const;

/** "Aura you control that's attached to a creature" */
const MY_AURAS_ON_CREATURES: ObjectFilter = {
  subtypes: ['Aura'],
  controller: 'you',
  attachedTo: { kind: 'matching', filter: { types: ['creature'] } },
};
const COUNT_MY_AURAS_ON_CREATURES = { kind: 'countOf', filter: MY_AURAS_ON_CREATURES } as const;

export const SYNTHETIC_DANITHA_G3_LIST: readonly CardDefinition[] = [
  // "This creature gets +2/+2 for each Aura attached to it. Whenever you cast an Aura spell, you may draw a card."
  singleFace({
    name: 'SYNTHETIC Aura Weaver',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Kor', 'Wizard'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 0,
    toughness: 2,
    oracleText:
      'This creature gets +2/+2 for each Aura attached to it.\nWhenever you cast an Aura spell, you may draw a card.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'this' },
          power: {
            kind: 'times',
            factor: 2,
            of: { kind: 'countOf', filter: { subtypes: ['Aura'], attachedTo: { kind: 'source' } } },
          },
          toughness: {
            kind: 'times',
            factor: 2,
            of: { kind: 'countOf', filter: { subtypes: ['Aura'], attachedTo: { kind: 'source' } } },
          },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell', subtypes: ['Aura'] }, by: 'you' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        optional: true,
      },
    ],
  }),
  // "Enchant creature. When this Aura enters, draw a card for each Aura you control that's attached to a creature. Enchanted creature gets +1/+1 for each Aura you control
  // that's attached to a creature."
  singleFace({
    name: 'SYNTHETIC Aura Scholar',
    manaCost: ['3', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Enchant creature\nWhen this Aura enters, draw a card for each Aura you control that's attached to a creature.\nEnchanted creature gets +1/+1 for each Aura you control that's attached to a creature.",
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'draw', player: { kind: 'you' }, count: COUNT_MY_AURAS_ON_CREATURES },
      },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: HOST,
          power: COUNT_MY_AURAS_ON_CREATURES,
          toughness: COUNT_MY_AURAS_ON_CREATURES,
        },
      },
    ],
  }),
  // "Destroy all creatures that aren't enchanted. They can't be regenerated."
  singleFace({
    name: 'SYNTHETIC Bare Purge',
    manaCost: ['3', 'W', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: "Destroy all creatures that aren't enchanted. They can't be regenerated.",
    spell: {
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], enchanted: false },
        },
        cantBeRegenerated: true,
      },
    },
  }),
  // "Enchant creature. Enchanted creature gets +1/+1 for each enchantment you control and has first strike."
  singleFace({
    name: 'SYNTHETIC Armor of Many',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Enchant creature\nEnchanted creature gets +1/+1 for each enchantment you control and has first strike.',
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: HOST,
          power: {
            kind: 'countOf',
            filter: { types: ['enchantment'], controller: 'you' },
          },
          toughness: {
            kind: 'countOf',
            filter: { types: ['enchantment'], controller: 'you' },
          },
        },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: HOST, keyword: { kind: 'firstStrike' } },
      },
    ],
  }),
  // "Enchant creature. Enchanted creature gets +2/+2. As long as another Aura is attached to enchanted creature, it has first strike and lifelink."
  singleFace({
    name: 'SYNTHETIC Twin Face Aura',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Enchant creature\nEnchanted creature gets +2/+2.\nAs long as another Aura is attached to enchanted creature, it has first strike and lifelink.',
    abilities: [
      ENCHANT_CREATURE,
      { kind: 'static', static: { kind: 'modifyPt', subject: HOST, power: 2, toughness: 2 } },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'firstStrike' } },
        condition: {
          kind: 'amountIs',
          amount: {
            kind: 'countOf',
            filter: { subtypes: ['Aura'], other: true, attachedTo: { kind: 'host' } },
          },
          compare: { cmp: 'atLeast', value: 1 },
        },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'lifelink' } },
        condition: {
          kind: 'amountIs',
          amount: {
            kind: 'countOf',
            filter: { subtypes: ['Aura'], other: true, attachedTo: { kind: 'host' } },
          },
          compare: { cmp: 'atLeast', value: 1 },
        },
      },
    ],
  }),
  // "Enchant creature. As long as enchanted creature is green, it gets +1/+1 and has indestructible. As long as enchanted creature is white, it gets +1/+1 and has flying."
  singleFace({
    name: 'SYNTHETIC Dual Hue Aura',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G', 'W'],
    colorIdentity: ['G', 'W'],
    oracleText:
      'Enchant creature\nAs long as enchanted creature is green, it gets +1/+1 and has indestructible.\nAs long as enchanted creature is white, it gets +1/+1 and has flying.',
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: ATTACHED, power: 1, toughness: 1 },
        condition: { kind: 'objectMatches', of: { kind: 'attached' }, filter: { types: ['creature'], colors: ['G'] } },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'indestructible' } },
        condition: { kind: 'objectMatches', of: { kind: 'attached' }, filter: { types: ['creature'], colors: ['G'] } },
      },
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: ATTACHED, power: 1, toughness: 1 },
        condition: { kind: 'objectMatches', of: { kind: 'attached' }, filter: { types: ['creature'], colors: ['W'] } },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'flying' } },
        condition: { kind: 'objectMatches', of: { kind: 'attached' }, filter: { types: ['creature'], colors: ['W'] } },
      },
    ],
  }),
  // "Flash. Enchant creature you control. As long as this Aura entered this turn, enchanted creature has hexproof. Enchanted creature gets +1/+1."
  singleFace({
    name: 'SYNTHETIC Flash Ward Aura',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Flash\nEnchant creature you control\nAs long as this Aura entered this turn, enchanted creature has hexproof.\nEnchanted creature gets +1/+1.',
    abilities: [
      kw('flash'),
      {
        kind: 'keyword',
        keyword: { kind: 'enchant', filter: { types: ['creature'], controller: 'you' } },
      },
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: HOST, keyword: { kind: 'hexproof' } },
        condition: { kind: 'thisEnteredThisTurn' },
      },
      { kind: 'static', static: { kind: 'modifyPt', subject: HOST, power: 1, toughness: 1 } },
    ],
  }),
  // "Enchant creature. Equip abilities you activate that target enchanted creature cost {3} less to activate. Aura spells you cast that target enchanted creature cost {3} less to
  // cast. Enchanted creature gets +2/+2 for each Aura and Equipment attached to it."
  singleFace({
    name: 'SYNTHETIC Strong Spine Aura',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Enchant creature\nEquip abilities you activate that target enchanted creature cost {3} less to activate.\nAura spells you cast that target enchanted creature cost {3} less to cast.\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.',
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'equip',
          targeting: { hostOfSource: true },
          amount: 3,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: {
            subtypes: ['Aura'],
            controller: 'you',
            targetsObject: { hostOfSource: true },
          },
          amount: 3,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: HOST,
          power: {
            kind: 'times',
            factor: 2,
            of: {
              kind: 'countOf',
              filter: {
                anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
                attachedTo: { kind: 'host' },
              },
            },
          },
          toughness: {
            kind: 'times',
            factor: 2,
            of: {
              kind: 'countOf',
              filter: {
                anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
                attachedTo: { kind: 'host' },
              },
            },
          },
        },
      },
    ],
  }),
  // An Equipment with an expensive Equip cost, for the Equip reduction: "Equip {4}".
  singleFace({
    name: 'SYNTHETIC Costly Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature gets +1/+1.\nEquip {4}',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'modifyPt', subject: { kind: 'attached', types: ['creature'] }, power: 1, toughness: 1 },
      },
      {
        kind: 'keyword',
        keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['4'] }] },
      },
    ],
  }),
];
