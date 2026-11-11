/**
 * SYNTHETIC CARDS FOR "EACH OTHER [CREATURE] YOU CONTROL ENTERS WITH AN ADDITIONAL COUNTER". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): a replacement effect of a permanent for the permanents that enter the battlefield
 * ("Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control", "Each other creature you
 * control of the chosen type enters with an additional +1/+1 counter on it", "Each creature your opponents control enters with a -1/-1
 * counter on it"), and a spell that creates an Angel token. Names start with "SYNTHETIC "; oracleId is null. The text describes what the
 * AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { TokenDefinition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const ANGEL_TOKEN: TokenDefinition = {
  name: 'Angel',
  manaCost: null,
  types: ['creature'],
  supertypes: [],
  subtypes: ['Angel'],
  colors: ['W'],
  power: 3,
  toughness: 3,
  loyalty: null,
  defense: null,
  oracleText: 'Flying',
  abilities: [kw('flying')],
};

export const SYNTHETIC_ENTERS_GROUP_LIST: readonly CardDefinition[] = [
  // "Flying, vigilance. Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control."
  singleFace({
    name: 'SYNTHETIC Chief Angel',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'Flying, vigilance. Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.',
    abilities: [
      kw('flying'),
      kw('vigilance'),
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { subtypes: ['Angel'], controller: 'you', other: true },
          counter: '+1/+1',
          count: { kind: 'countOf', filter: { subtypes: ['Angel'], controller: 'you' } },
        },
      },
    ],
  }),
  // "As this creature enters, choose a creature type. This creature is the chosen type in addition to its other types. Each other creature
  //  you control of the chosen type enters with an additional +1/+1 counter on it."
  singleFace({
    name: 'SYNTHETIC Type Mimic',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Shapeshifter'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 1,
    oracleText:
      'As this creature enters, choose a creature type. This creature is the chosen type in addition to its other types. Each other creature you control of the chosen type enters with an additional +1/+1 counter on it.',
    abilities: [
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'setTypes',
          subject: { kind: 'this' },
          chosenType: true,
          additive: true,
        },
      },
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you', other: true, chosenType: true },
          counter: '+1/+1',
          count: 1,
        },
      },
    ],
  }),
  // "Each nontoken creature you control enters with two additional +1/+1 counters on it." (a number other than 1, nontoken, the source not excluded)
  singleFace({
    name: 'SYNTHETIC Growth Banner',
    manaCost: ['3'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Each nontoken creature you control enters with two additional +1/+1 counters on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'you', token: false },
          counter: '+1/+1',
          count: 2,
        },
      },
    ],
  }),
  // "Each creature your opponents control enters with a -1/-1 counter on it." (a different controller and counter)
  singleFace({
    name: 'SYNTHETIC Withering Shrine',
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each creature your opponents control enters with a -1/-1 counter on it.',
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: { types: ['creature'], controller: 'opponent' },
          counter: '-1/-1',
          count: 1,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Angel Summons',
    manaCost: ['3', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Create a 3/3 white Angel creature token with flying.',
    spell: {
      effect: {
        kind: 'createToken',
        token: { kind: 'custom', definition: ANGEL_TOKEN },
        count: 1,
      },
    },
  }),
];
