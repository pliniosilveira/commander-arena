/**
 * SYNTHETIC AURA, EQUIPMENT AND STATIC-ABILITY CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Auras (CR 303.4, 702.5), Equipment (CR 301.5, 702.6) and static
 * abilities that change power and toughness or grant keywords (CR 611.3, 613.1f, 613.4c). Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these copies a real card.
 */
import type { Ability, Cost, ObjectFilter, StaticEffect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const enchant = (filter: ObjectFilter): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'enchant', filter },
});
const equip = (...cost: Cost[]): Ability => ({ kind: 'keyword', keyword: { kind: 'equip', cost } });
const staticAbility = (effect: StaticEffect): Ability => ({ kind: 'static', static: effect });
const ATTACHED = { kind: 'attached' } as const;
const pt = (power: number, toughness: number): Ability =>
  staticAbility({ kind: 'modifyPt', subject: ATTACHED, power, toughness });
const grant = (kind: 'flying' | 'hexproof' | 'vigilance' | 'trample' | 'firstStrike'): Ability =>
  staticAbility({ kind: 'grantKeyword', subject: ATTACHED, keyword: { kind } });

const CREATURE: ObjectFilter = { types: ['creature'] };

export const SYNTHETIC_ATTACHMENT_LIST: readonly CardDefinition[] = [
  // ---- Auras
  singleFace({
    name: 'SYNTHETIC Might Aura',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Enchant creature. Enchanted creature gets +2/+2.',
    abilities: [enchant(CREATURE), pt(2, 2)],
  }),
  singleFace({
    name: 'SYNTHETIC Wings Aura',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Enchant creature. Enchanted creature has flying.',
    abilities: [enchant(CREATURE), grant('flying')],
  }),
  singleFace({
    name: 'SYNTHETIC Loyal Aura',
    manaCost: ['G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Enchant creature you control. Enchanted creature gets +1/+1 and has vigilance.',
    abilities: [enchant({ types: ['creature'], controller: 'you' }), pt(1, 1), grant('vigilance')],
  }),
  singleFace({
    name: 'SYNTHETIC Curse Aura',
    manaCost: ['B'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Enchant creature. Enchanted creature gets -2/-2.',
    abilities: [enchant(CREATURE), pt(-2, -2)],
  }),
  singleFace({
    name: 'SYNTHETIC Shield Land Aura',
    manaCost: ['W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Enchant land. Enchanted land has hexproof.',
    abilities: [enchant({ types: ['land'] }), grant('hexproof')],
  }),
  singleFace({
    name: 'SYNTHETIC Hex Aura',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Enchant creature. Enchanted creature has hexproof.',
    abilities: [enchant(CREATURE), grant('hexproof')],
  }),
  // ---- Equipment
  singleFace({
    name: 'SYNTHETIC Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature gets +2/+0. Equip {1}',
    abilities: [pt(2, 0), equip(mana('1'))],
  }),
  singleFace({
    name: 'SYNTHETIC Cloak',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature gets +0/+2 and has hexproof. Equip {2}',
    abilities: [pt(0, 2), grant('hexproof'), equip(mana('2'))],
  }),
  singleFace({
    name: 'SYNTHETIC Wing Boots',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature has flying and trample. Equip {1}',
    abilities: [grant('flying'), grant('trample'), equip(mana('1'))],
  }),
  singleFace({
    name: 'SYNTHETIC Blood Blade',
    manaCost: ['1'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Equipped creature gets +3/+0. Equip-Pay 2 life.',
    abilities: [pt(3, 0), equip({ kind: 'payLife', amount: 2 })],
  }),
  // ---- Static abilities with a filter subject
  singleFace({
    name: 'SYNTHETIC Anthem',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Creatures you control get +1/+1.',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
        power: 1,
        toughness: 1,
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Standard Bearer',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Other creatures you control get +1/+1 and have flying.',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you' },
          other: true,
        },
        power: 1,
        toughness: 1,
      }),
      staticAbility({
        kind: 'grantKeyword',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you' },
          other: true,
        },
        keyword: { kind: 'flying' },
      }),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Plague Banner',
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Creatures your opponents control get -1/-1.',
    abilities: [
      staticAbility({
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { types: ['creature'], controller: 'opponent' } },
        power: -1,
        toughness: -1,
      }),
    ],
  }),
];
