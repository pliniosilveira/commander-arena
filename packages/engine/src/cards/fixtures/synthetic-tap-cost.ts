/**
 * SYNTHETIC CARDS FOR "TAP AN UNTAPPED CREATURE YOU CONTROL" AS A COST NEXT TO MANA AND IN A MANA ABILITY (issue 160). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards need from the engine: an activated ability whose cost is a mana cost, {T} and the tapping of an untapped creature
 * (D-133 refused it with mana), a creature with a mana ability that also taps an untapped creature, a land with that same second ability, and a plain creature that
 * makes mana and one that does not, to be tapped (or kept) for the cost. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { Cost } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const TAP_A_CREATURE: Cost = {
  kind: 'tapPermanents',
  filter: { types: ['creature'] },
  count: 1,
};

export const SYNTHETIC_TAP_COST_LIST: readonly CardDefinition[] = [
  // "{1}, {T}, Tap an untapped creature you control: Draw a card."
  singleFace({
    name: 'SYNTHETIC Chapel Scribe',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Human', 'Druid'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: '{1}, {T}, Tap an untapped creature you control: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }, TAP_A_CREATURE],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "{T}, Tap an untapped creature you control: Add one mana of any color."
  singleFace({
    name: 'SYNTHETIC Gate Warden',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 2,
    oracleText: '{T}, Tap an untapped creature you control: Add one mana of any color.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, TAP_A_CREATURE],
        production: { kind: 'anyColor' },
      },
    ],
  }),
  // "{T}: Add {C}. {T}, Tap an untapped creature you control: Add one mana of any color."
  singleFace({
    name: 'SYNTHETIC Gate Hold',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}: Add {C}. {T}, Tap an untapped creature you control: Add one mana of any color.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, TAP_A_CREATURE],
        production: { kind: 'anyColor' },
      },
    ],
  }),
  // "{T}: Add {G}." A creature that is also a mana source: to be tapped for the cost, or tapped for mana instead.
  singleFace({
    name: 'SYNTHETIC Seed Sprite',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Faerie'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 0,
    toughness: 1,
    oracleText: '{T}: Add {G}.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
    ],
  }),
];
