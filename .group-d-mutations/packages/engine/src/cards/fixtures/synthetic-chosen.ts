/**
 * SYNTHETIC CHOSEN-TYPE AND CHOSEN-COLOR CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-100: permanents that ask "As this enters, choose a
 * creature type / a color" (CR 614.12, 614.12a) and read the answer ("Creatures you control of the
 * chosen type get +1/+1", "This is the chosen type in addition to its other types", spells and triggers
 * of the chosen type, CR 607.2d). Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const CHOOSE_TYPE: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'creatureType' },
};
const CHOOSE_COLOR: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'color' },
};

/** "Creatures you control of the chosen type" (and "Other ..."). */
const OF_TYPE: ObjectFilter = { types: ['creature'], controller: 'you', chosenType: true };
const OF_COLOR: ObjectFilter = { types: ['creature'], controller: 'you', chosenColor: true };

const pump = (filter: ObjectFilter, other = false): Ability => ({
  kind: 'static',
  static: {
    kind: 'modifyPt',
    subject: { kind: 'filter', filter, ...(other ? { other: true as const } : {}) },
    power: 1,
    toughness: 1,
  },
});

export const SYNTHETIC_CHOSEN_LIST: readonly CardDefinition[] = [
  // "As this enters, choose a creature type. Creatures you control of the chosen type get +1/+1."
  singleFace({
    name: 'SYNTHETIC Rally Banner',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'As this enchantment enters, choose a creature type. Creatures you control of the chosen type get +1/+1.',
    abilities: [CHOOSE_TYPE, pump(OF_TYPE)],
  }),
  // "As this enters, choose a color. Creatures you control of the chosen color get +1/+1."
  singleFace({
    name: 'SYNTHETIC Hue Banner',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, choose a color. Creatures you control of the chosen color get +1/+1.',
    abilities: [CHOOSE_COLOR, pump(OF_COLOR)],
  }),
  // "As this creature enters, choose a creature type. Other creatures you control of the chosen type get +1/+1."
  singleFace({
    name: 'SYNTHETIC Banner Captain',
    manaCost: ['1', 'G', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Warrior'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'As this creature enters, choose a creature type. Other creatures you control of the chosen type get +1/+1.',
    abilities: [CHOOSE_TYPE, pump(OF_TYPE, true)],
  }),
  // "... This creature is the chosen type in addition to its other types."
  singleFace({
    name: 'SYNTHETIC Shifting Captain',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Shapeshifter'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      'As this creature enters, choose a creature type. This creature is the chosen type in addition to its other types. Other creatures you control of the chosen type get +1/+1.',
    abilities: [
      CHOOSE_TYPE,
      {
        kind: 'static',
        static: { kind: 'setTypes', subject: { kind: 'this' }, chosenType: true, additive: true },
      },
      pump(OF_TYPE, true),
    ],
  }),
  // "As this creature enters, choose a color. Other creatures you control of the chosen color get +1/+1."
  singleFace({
    name: 'SYNTHETIC Hue Captain',
    manaCost: ['1', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'As this creature enters, choose a color. Other creatures you control of the chosen color get +1/+1.',
    abilities: [CHOOSE_COLOR, pump(OF_COLOR, true)],
  }),
  // A land that asks as it is played (a land is played from the hand, CR 305.1).
  singleFace({
    name: 'SYNTHETIC Tribal Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: 'As this land enters, choose a creature type. {T}: Add {C}.',
    abilities: [
      CHOOSE_TYPE,
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
    ],
  }),
  // "Creature spells of the chosen type you cast cost {1} less to cast."
  singleFace({
    name: 'SYNTHETIC Tribal Discount',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, choose a creature type. Creature spells of the chosen type you cast cost {1} less to cast.',
    abilities: [
      CHOOSE_TYPE,
      { kind: 'static', static: { kind: 'costReduction', spells: OF_TYPE, amount: 1 } },
    ],
  }),
  // "Creature spells of the chosen type cost {1} less to cast." (D-255): no "you cast", so the spells of every player (the shape of Urza's Incubator)
  singleFace({
    name: 'SYNTHETIC Shared Discount',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'As this artifact enters, choose a creature type. Creature spells of the chosen type cost {1} less to cast.',
    abilities: [
      CHOOSE_TYPE,
      {
        kind: 'static',
        static: {
          kind: 'costReduction',
          spells: { types: ['creature'], chosenType: true },
          amount: 1,
        },
      },
    ],
  }),
  // "Whenever another creature of the chosen type enters under your control, you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Tribal Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'As this creature enters, choose a creature type. Whenever another creature of the chosen type enters under your control, you gain 1 life.',
    abilities: [
      CHOOSE_TYPE,
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { ...OF_TYPE, other: true } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
  // A permanent put onto the battlefield by an effect (the choice is part of entering, CR 614.12).
  singleFace({
    name: 'SYNTHETIC Raise Dead',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Return target creature card from your graveyard to the battlefield.',
    spell: {
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'battlefield' },
    },
  }),
];
