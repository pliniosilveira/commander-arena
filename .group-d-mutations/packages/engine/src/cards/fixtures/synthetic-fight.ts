/**
 * SYNTHETIC CARDS FOR FIGHT AND "EACH OF THOSE TOKENS FIGHTS A DIFFERENT ONE OF THOSE CREATURES". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-145 (the Dinosaurs slice): "Target creature you control fights target creature you don't control", a
 * sorcery that creates a 4/4 Beast token for each creature the opponents control and has each token fight a different one of those
 * creatures (`fight` with `pairing`), and one that creates only two 3/3 tokens that fight different creatures of a larger group. Names
 * start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const beast = (power: number, toughness: number): TokenDefinition => ({
  name: 'Phyrexian Beast',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Phyrexian', 'Beast'],
  colors: ['G'],
  power,
  toughness,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [],
});

const THEIR_CREATURES = { types: ['creature'], controller: 'opponent' } as const;

export const SYNTHETIC_FIGHT_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Duel',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: "Target creature you control fights target creature you don't control.",
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
        { id: 't2', what: { kind: 'object', filter: THEIR_CREATURES } },
      ],
      effect: {
        kind: 'fight',
        fighters: { kind: 'target', id: 't1' },
        against: { kind: 'target', id: 't2' },
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Swarm Predation',
    manaCost: ['4', 'G', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: beast(4, 4) },
            count: { kind: 'countOf', filter: THEIR_CREATURES },
          },
          {
            kind: 'fight',
            fighters: { kind: 'moved' },
            against: { kind: 'each', filter: THEIR_CREATURES },
            pairing: 'differentChosen',
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Twin Brawl',
    manaCost: ['3', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Create two 3/3 green Phyrexian Beast creature tokens. Each of those tokens fights a different creature an opponent controls.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'createToken',
            token: { kind: 'custom', definition: beast(3, 3) },
            count: 2,
          },
          {
            kind: 'fight',
            fighters: { kind: 'moved' },
            against: { kind: 'each', filter: THEIR_CREATURES },
            pairing: 'differentChosen',
          },
        ],
      },
    },
  }),
];
