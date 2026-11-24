/**
 * SYNTHETIC INITIATIVE CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the initiative (CR 726) and of venturing into Undercity (CR 701.49). Names start with "SYNTHETIC "; oracleId is null. The text describes
 * what the AST does; it is not Oracle text, and none of these copies a real card's definition.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_INITIATIVE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Initiative Claim',
    manaCost: ['2', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'You take the initiative.',
    spell: { effect: { kind: 'takeInitiative', player: { kind: 'you' } } },
  }),
  singleFace({
    name: 'SYNTHETIC Undercity Dive',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Venture into Undercity.',
    spell: { effect: { kind: 'ventureIntoDungeon', dungeon: 'undercity' } },
  }),
];
