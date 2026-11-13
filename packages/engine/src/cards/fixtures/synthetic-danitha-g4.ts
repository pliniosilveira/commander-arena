/**
 * SYNTHETIC CARDS FOR THE DANITHA DECK (ISSUE 26), GROUP 4 (D-1240 TO D-1245). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of Umbra armor (CR 702.89a, D-1241: "If enchanted permanent would be destroyed, instead remove all damage marked on it and
 * destroy this Aura") and of "modified" permanents (CR 700.9, D-1240: a counter, an Equipment, or an Aura its controller controls). Each one has the
 * wording of a real card, the name replaced. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const ENCHANT_CREATURE: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};
const ATTACHED = { kind: 'attached', types: ['creature'] } as const;
const UMBRA: Ability = { kind: 'replacement', replacement: { kind: 'umbraArmor' } };
const MODIFIED_CREATURE: ObjectFilter = { types: ['creature'], modified: true };

export const SYNTHETIC_DANITHA_G4_LIST: readonly CardDefinition[] = [
  // "Enchant creature. Enchanted creature gets +2/+2. Umbra armor"
  singleFace({
    name: 'SYNTHETIC Umbra Hide',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Enchant creature\nEnchanted creature gets +2/+2.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)',
    abilities: [
      ENCHANT_CREATURE,
      { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 2, toughness: 2 } },
      UMBRA,
    ],
  }),
  // "Enchant creature. Enchanted creature has reach. Umbra armor" (a second Umbra Aura, to test two on one creature)
  singleFace({
    name: 'SYNTHETIC Umbra Veil',
    manaCost: ['G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Enchant creature\nEnchanted creature has reach.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)',
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'static',
        static: { kind: 'grantKeyword', subject: ATTACHED, keyword: { kind: 'reach' } },
      },
      UMBRA,
    ],
  }),
  // "Enchant modified creature. Enchanted creature gets +3/+3. Umbra armor"
  singleFace({
    name: 'SYNTHETIC Umbra Mantle',
    manaCost: ['G', 'G'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Enchant modified creature\nEnchanted creature gets +3/+3.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: MODIFIED_CREATURE } },
      { kind: 'static', static: { kind: 'modifyPt', subject: ATTACHED, power: 3, toughness: 3 } },
      UMBRA,
    ],
  }),
  // "Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power. Whenever this creature attacks, other modified creatures you control get +X/+X until end of turn, where X is this creature's power."
  singleFace({
    name: 'SYNTHETIC Modified Rallier',
    manaCost: ['1', 'G', 'W'],
    types: ['creature'],
    subtypes: ['Fox', 'Samurai'],
    colors: ['G', 'W'],
    colorIdentity: ['G', 'W'],
    power: 1,
    toughness: 3,
    oracleText:
      "Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power.\nWhenever this creature attacks, other modified creatures you control get +X/+X until end of turn, where X is this creature's power.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: {
            controller: 'you',
            anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
          },
          amount: { kind: 'powerOf', of: { kind: 'this' } },
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'modifyPt',
          objects: {
            kind: 'each',
            filter: { ...MODIFIED_CREATURE, controller: 'you', other: true },
          },
          power: { kind: 'powerOf', of: { kind: 'this' } },
          toughness: { kind: 'powerOf', of: { kind: 'this' } },
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
];
