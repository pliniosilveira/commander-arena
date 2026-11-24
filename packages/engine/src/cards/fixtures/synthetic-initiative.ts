/**
 * SYNTHETIC INITIATIVE AND VENTURE CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the initiative (CR 726) and of venturing into Undercity (CR 701.49, 309). Names start with "SYNTHETIC "; oracleId is null. The text describes what
 * the AST does; it is not Oracle text, and none of these copies a real card's definition.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const takeOnEntry: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'takeInitiative', player: { kind: 'you' } },
};

export const SYNTHETIC_INITIATIVE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Initiative Herald',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Warrior'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'When this creature enters, you take the initiative.',
    abilities: [takeOnEntry],
  }),
  singleFace({
    name: 'SYNTHETIC Initiative Flash',
    manaCost: ['1', 'W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You take the initiative.',
    spell: { effect: { kind: 'takeInitiative', player: { kind: 'you' } } },
  }),
  singleFace({
    name: 'SYNTHETIC Initiative Gift',
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Target player takes the initiative.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'takeInitiative', player: { kind: 'target', id: 't1' } },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Delve Into Undercity',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'You venture into Undercity.',
    spell: { effect: { kind: 'venture', player: { kind: 'you' }, dungeon: 'undercity' } },
  }),
  singleFace({
    name: 'SYNTHETIC Mass Venture',
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each player ventures into Undercity.',
    spell: { effect: { kind: 'venture', player: { kind: 'eachPlayer' }, dungeon: 'undercity' } },
  }),
];
