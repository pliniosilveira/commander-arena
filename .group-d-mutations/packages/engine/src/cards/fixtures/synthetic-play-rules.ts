/**
 * SYNTHETIC PLAY-RULE CARDS: ADDITIONAL LAND DROPS, LOOKING AT THE TOP CARD, THE ATTACK TAX AND THE OPTIONAL
 * UNTAP. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-125: the static ability that raises the number of lands a
 * player can play in a turn (CR 305.2), the one that lets a player look at the top card of their library
 * (CR 401.5), the attack tax (CR 508.1h) and the optional untap (CR 502.3). Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text and none of these copies a real card's definition.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const landDrops = (count: number, eachPlayer?: true): Ability => ({
  kind: 'static',
  static: { kind: 'additionalLandDrops', count, ...(eachPlayer ? { eachPlayer } : {}) },
});

/** "Creatures can't attack you unless their controller pays [mana] for each creature attacking you" (CR 508.1h). */
const attackTax = (symbols: string[], planeswalkers?: true): Ability => ({
  kind: 'static',
  static: {
    kind: 'attackTax',
    cost: [{ kind: 'mana', symbols }],
    ...(planeswalkers ? { planeswalkers } : {}),
  },
});

/** "You may choose not to untap this permanent during your untap step." (CR 502.3). */
const optionalUntap: Ability = { kind: 'static', static: { kind: 'optionalUntap' } };

export const SYNTHETIC_PLAY_RULE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Wandering Path',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You may play an additional land on each of your turns.',
    abilities: [landDrops(1)],
  }),
  singleFace({
    name: 'SYNTHETIC Wandering Scout',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: 'You may play an additional land on each of your turns.',
    abilities: [landDrops(1)],
  }),
  singleFace({
    name: 'SYNTHETIC Twin Path',
    manaCost: ['3', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You may play two additional lands on each of your turns.',
    abilities: [landDrops(2)],
  }),
  singleFace({
    name: 'SYNTHETIC Shared Path',
    manaCost: ['2', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Each player may play an additional land on each of their turns.',
    abilities: [landDrops(1, true)],
  }),
  singleFace({
    name: 'SYNTHETIC Seer Lens',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You may look at the top card of your library any time.',
    abilities: [{ kind: 'static', static: { kind: 'lookAtTopOfLibrary' } }],
  }),
  singleFace({
    name: 'SYNTHETIC Seer Scout',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Scout'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'You may look at the top card of your library any time.',
    abilities: [{ kind: 'static', static: { kind: 'lookAtTopOfLibrary' } }],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Gate',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
    abilities: [attackTax(['2'])],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Toll',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Creatures can't attack you unless their controller pays {1} for each creature they control that's attacking you.",
    abilities: [attackTax(['1'])],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Warden',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText:
      "Creatures can't attack you unless their controller pays {1} for each creature they control that's attacking you.",
    abilities: [attackTax(['1'])],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Rune',
    manaCost: ['W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W', 'R'],
    oracleText:
      "Creatures can't attack you unless their controller pays {R} for each creature they control that's attacking you.",
    abilities: [attackTax(['R'])],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Aegis',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.",
    abilities: [attackTax(['1'], true)],
  }),
  singleFace({
    name: 'SYNTHETIC Tax Blood',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.",
    abilities: [attackTax(['W/P'], true)],
  }),
  singleFace({
    name: 'SYNTHETIC Drowsy Land',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}. You may choose not to untap this land during your untap step.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      optionalUntap,
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Drowsy Giant',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 3,
    toughness: 3,
    oracleText: 'You may choose not to untap this creature during your untap step.',
    abilities: [optionalUntap],
  }),
  singleFace({
    name: 'SYNTHETIC Drowsy Rod',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'You may choose not to untap this artifact during your untap step.',
    abilities: [optionalUntap],
  }),
  singleFace({
    name: 'SYNTHETIC Drowsy Sleeper',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 4,
    oracleText:
      "You may choose not to untap this creature during your untap step. This creature doesn't untap during your untap step.",
    abilities: [
      optionalUntap,
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'doesntUntap' },
      },
    ],
  }),
];
