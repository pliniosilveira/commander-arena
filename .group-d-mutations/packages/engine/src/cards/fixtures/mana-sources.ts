/**
 * Non-creature mana sources: Sol Ring and Command Tower. Hand-written from the cards' Oracle
 * text; UNVERIFIED against Scryfall until the M4 import or the A20 spike matches them
 * (oracleId is null).
 *
 * Sol Ring's {C} symbols are colorless, so its color identity is empty (CR 903.4). Command
 * Tower's text has no colored symbol, so its identity is empty too; its ability is a mana
 * ability (CR 605.1a) whose production depends on the commander's color identity (CR 903.4f).
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const MANA_SOURCE_FIXTURES: readonly CardDefinition[] = [
  singleFace({
    name: 'Sol Ring',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add {C}{C}.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C', 'C'] } },
    ],
  }),
  singleFace({
    name: 'Command Tower',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: [],
    oracleText: "{T}: Add one mana of any color in your commander's color identity.",
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'commanderIdentity' } },
    ],
  }),
];
