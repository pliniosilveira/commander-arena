/**
 * SYNTHETIC CARDS FOR MANA ABILITIES WITH A RESTRICTION, A COUNT OR A LIMIT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Quandrix Unlimited deck, group F: "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana
 * costs" (`spendOnly.qualities`), "Add X mana of any one color, where X is this creature's power" and "Choose a color. Add one mana of that color for each charge
 * counter on this artifact" (`anyColorAmount`), "Remove a charge counter: Add one mana of any color. Activate only once each turn." (`ManaAbility.oncePerTurn`) and
 * "You may cast spells this turn as though they had flash." (`grantCastAsThoughFlash`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_MANA_GROUP_F_LIST: readonly CardDefinition[] = [
  // "{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs."
  singleFace({
    name: 'SYNTHETIC Restricted Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['U', 'G'],
    oracleText:
      '{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G', 'U'] },
        spendOnly: { qualities: [{ kind: 'manaValueAtLeast', value: 5 }, { kind: 'hasX' }] },
      },
    ],
  }),
  // The same limit with the mana value alone, at 4.
  singleFace({
    name: 'SYNTHETIC Big Spell Rock',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. Spend this mana only to cast spells with mana value 4 or greater.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'fixed', mana: ['G'] },
        spendOnly: { qualities: [{ kind: 'manaValueAtLeast', value: 4 }] },
      },
    ],
  }),
  // "{T}: Add X mana of any one color, where X is this creature's power."
  singleFace({
    name: 'SYNTHETIC Power Channeler',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: "{T}: Add X mana of any one color, where X is this creature's power.",
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyColorAmount', amount: { kind: 'powerOf', of: { kind: 'this' } } },
      },
    ],
  }),
  // "{T}: Choose a color. Add one mana of that color for each charge counter on this artifact."
  singleFace({
    name: 'SYNTHETIC Charge Horn',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Choose a color. Add one mana of that color for each charge counter on this artifact.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: {
          kind: 'anyColorAmount',
          amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'charge' },
        },
      },
    ],
  }),
  // "Remove a charge counter from this enchantment: Add one mana of any color. Activate only once each turn."
  singleFace({
    name: 'SYNTHETIC Bloom Once',
    manaCost: ['G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Remove a charge counter from this enchantment: Add one mana of any color. Activate only once each turn.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'removeCounters', counter: 'charge', count: 1 }],
        production: { kind: 'anyColor' },
        oncePerTurn: true,
      },
    ],
  }),
  // "{G}{U}, {T}: You may cast spells this turn as though they had flash."
  singleFace({
    name: 'SYNTHETIC Flash Haven',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['U', 'G'],
    oracleText:
      '{T}: Add {C}.\n{G}{U}, {T}: You may cast spells this turn as though they had flash.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['G', 'U'] }, { kind: 'tap' }],
        effect: {
          kind: 'grantCastAsThoughFlash',
          player: { kind: 'you' },
          duration: 'untilEndOfTurn',
        },
      },
    ],
  }),
  // Spells for the restriction: mana value 5, mana value 2 and an {X} spell, each gaining life.
  singleFace({
    name: 'SYNTHETIC Big Sorcery',
    manaCost: ['3', 'G', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain 5 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 5 } },
  }),
  singleFace({
    name: 'SYNTHETIC Small Sorcery',
    manaCost: ['G', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain 2 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC Dual Sorcery',
    manaCost: ['G', 'U'],
    types: ['sorcery'],
    colors: ['U', 'G'],
    colorIdentity: ['U', 'G'],
    oracleText: 'You gain 2 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
  }),
  singleFace({
    name: 'SYNTHETIC X Sorcery',
    manaCost: ['X', 'G', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain X life.',
    spell: {
      x: true,
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'x' } },
    },
  }),
];
