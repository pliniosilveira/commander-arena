/**
 * SYNTHETIC CARDS FOR POPULATE (CR 701.36, issue 160). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the keyword action: a sorcery that only populates, a sorcery that makes a 1/1 Soldier token, and one that makes a 3/3 Beast token (to have
 * two creature tokens to choose between), and a vanilla creature card (not a token, so never copied). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const token = (
  name: string,
  subtype: string,
  colors: TokenDefinition['colors'],
  power: number,
  toughness: number,
): TokenDefinition => ({
  name,
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: [subtype],
  colors,
  power,
  toughness,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
});

export const SYNTHETIC_POPULATE_LIST: readonly CardDefinition[] = [
  // "Populate."
  singleFace({
    name: 'SYNTHETIC Rite of Populating',
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Populate.',
    spell: { effect: { kind: 'populate' } },
  }),
  // "Create a 1/1 white Soldier creature token."
  singleFace({
    name: 'SYNTHETIC Soldier Muster',
    manaCost: ['W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create a 1/1 white Soldier creature token.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: token('Soldier', 'Soldier', ['W'], 1, 1) },
        count: 1,
      },
    },
  }),
  // "Create a 3/3 green Beast creature token."
  singleFace({
    name: 'SYNTHETIC Beast Muster',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Create a 3/3 green Beast creature token.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: token('Beast', 'Beast', ['G'], 3, 3) },
        count: 1,
      },
    },
  }),
];
