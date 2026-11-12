/**
 * SYNTHETIC CARDS FOR "MILL A CARD, YOU MAY PLAY IT" AND FOR MANA THAT COPIES THE SPELL IT IS SPENT ON. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-950 to D-953 (group 2b-b of the Niv-Mizzet deck): "Mill a card. You may play that card this turn." (a `mill` that
 * names what it milled, and a `mayPlay` of a card in a graveyard), "{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells."
 * (a `spendOnly` of two card types) and "{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you
 * may choose new targets for the copy." (a `spentRider` that copies, with a color of the spell). Names start with "SYNTHETIC "; oracleId is null.
 * The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_NIV_GROUP_2B_B_LIST: readonly CardDefinition[] = [
  // "Mill a card. You may play that card this turn."
  singleFace({
    name: 'SYNTHETIC Mill Rite',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Mill a card. You may play that card this turn.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'you' }, count: 1 },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
        ],
      },
    },
  }),
  // "Mill two cards. You may play those cards this turn."
  singleFace({
    name: 'SYNTHETIC Double Mill Rite',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Mill two cards. You may play those cards this turn.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'mill', player: { kind: 'you' }, count: 2 },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
        ],
      },
    },
  }),
  // "When this artifact enters, mill a card. You may play that card this turn. {T}: Add {R}. {T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells."
  singleFace({
    name: 'SYNTHETIC Spell Tablet',
    manaCost: ['2', 'R'],
    types: ['artifact'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'When this artifact enters, mill a card. You may play that card this turn. {T}: Add {R}. {T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'mill', player: { kind: 'you' }, count: 1 },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R'] },
      },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R', 'R'] },
        spendOnly: { types: ['instant', 'sorcery'] },
      },
    ],
  }),
  // "{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy."
  singleFace({
    name: 'SYNTHETIC Mirror Goggles',
    manaCost: ['5'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['R'],
    oracleText:
      '{T}: Add {R}. When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R'] },
        spentRider: {
          spells: { types: ['instant', 'sorcery'], colors: ['R'] },
          grants: { copySpell: 'may' },
        },
      },
    ],
  }),
  // The same copy, with the targets of the original ("copy that spell"), for any spell.
  singleFace({
    name: 'SYNTHETIC Exact Goggles',
    manaCost: ['4'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['U'],
    oracleText: '{T}: Add {U}. When that mana is spent to cast an instant spell, copy that spell.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['U'] },
        spentRider: { spells: { types: ['instant'] }, grants: { copySpell: 'no' } },
      },
    ],
  }),
  // "SYNTHETIC Blue Bolt deals 2 damage to any target." (a blue instant that a red-only rider must leave alone)
  singleFace({
    name: 'SYNTHETIC Blue Bolt',
    manaCost: ['1', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC Blue Bolt deals 2 damage to any target.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
    },
  }),
  // "SYNTHETIC Twin Singe deals 1 damage to any target." (a red sorcery that costs two mana, so that two riders can be spent on it)
  singleFace({
    name: 'SYNTHETIC Twin Singe',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC Twin Singe deals 1 damage to any target.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
    },
  }),
];
