/**
 * SYNTHETIC CARDS FOR MANA OF THE DRAGONS SLICE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151: "Add {R} for each tapped land your opponents control." (`fixed` mana `times` an amount), "{1}, {T}: Add two mana in
 * any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons." (`anyCombination`, `spendOnly` with
 * `alsoAbilities`), "{T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell." (a type and a subtype together),
 * "{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn." (`spentRider`) and "You don't lose unspent red
 * mana as steps and phases end." (`unspentManaStays`), with a Dragon that has an activated ability and a Dragon with haste. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_DRAGONS_MANA_LIST: readonly CardDefinition[] = [
  // "Add {R} for each tapped land your opponents control."
  singleFace({
    name: 'SYNTHETIC Tap Geyser',
    manaCost: ['3', 'R', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Add {R} for each tapped land your opponents control.',
    spell: {
      effect: {
        kind: 'addMana',
        mana: {
          kind: 'fixed',
          mana: ['R'],
          times: {
            kind: 'countOf',
            filter: { types: ['land'], controller: 'opponent', tapped: true },
          },
        },
      },
    },
  }),
  // "Add {C} for each creature you control." (a second kind of count, for two mana of a color)
  singleFace({
    name: 'SYNTHETIC Creature Geyser',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Add {G}{G} for each creature you control.',
    spell: {
      effect: {
        kind: 'addMana',
        mana: {
          kind: 'fixed',
          mana: ['G', 'G'],
          times: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
        },
      },
    },
  }),
  // "{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons."
  singleFace({
    name: 'SYNTHETIC Dragon Orb',
    manaCost: ['1', 'R'],
    types: ['artifact'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      '{1}, {T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2 },
        spendOnly: { subtypes: ['Dragon'], alsoAbilities: true },
      },
    ],
  }),
  // "{T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell."
  singleFace({
    name: 'SYNTHETIC Dragon Haven',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a Dragon creature spell.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColor' },
        spendOnly: { types: ['creature'], subtypes: ['Dragon'] },
      },
    ],
  }),
  // "{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn."
  singleFace({
    name: 'SYNTHETIC Hasty Orb',
    manaCost: ['2', 'R'],
    types: ['artifact'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      '{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['R'] },
        spentRider: { spells: { types: ['creature'], subtypes: ['Dragon'] }, grants: 'haste' },
      },
    ],
  }),
  // "Flying. {R}: This creature gets +1/+0 until end of turn." (a Dragon with an activated ability)
  singleFace({
    name: 'SYNTHETIC Firebreather Drake',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Flying. {R}: This creature gets +1/+0 until end of turn.',
    abilities: [
      kw('flying'),
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['R'] }],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: 1,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // "Flying. You don't lose unspent red mana as steps and phases end."
  singleFace({
    name: 'SYNTHETIC Mana Keeper Drake',
    manaCost: ['2', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 4,
    oracleText: "Flying. You don't lose unspent red mana as steps and phases end.",
    abilities: [
      kw('flying'),
      { kind: 'static', static: { kind: 'unspentManaStays', colors: ['R'] } },
    ],
  }),
];
