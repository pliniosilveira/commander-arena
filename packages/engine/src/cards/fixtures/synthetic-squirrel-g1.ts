/**
 * SYNTHETIC CARDS FOR TOKEN REPLACEMENTS, THE BLOOD TOKEN AND TOKEN LEAVING TRIGGERS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Squirreled Away deck, group 1: "If you would create a Clue, Food, or Treasure token, instead create one of each" (`tokensInstead` in
 * `eachOf` mode), "If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead"
 * (`plusThatMany`), a Blood token made when a creature of an opponent dies, and "Whenever a token you control leaves the battlefield, ..." Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const SQUIRREL: Extract<Effect, { kind: 'createToken' }>['token'] = {
  kind: 'custom',
  definition: {
    name: 'Squirrel',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Squirrel'],
    colors: ['G'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
};

const EACH_OF: Ability = {
  kind: 'replacement',
  replacement: {
    kind: 'tokensInstead',
    what: {
      token: true,
      anyOf: [{ subtypes: ['Clue'] }, { subtypes: ['Food'] }, { subtypes: ['Treasure'] }],
    },
    mode: 'eachOf',
    tokens: ['Clue', 'Food', 'Treasure'],
  },
};

const PLUS_THAT_MANY: Ability = {
  kind: 'replacement',
  replacement: {
    kind: 'tokensInstead',
    what: { token: true },
    mode: 'plusThatMany',
    token: SQUIRREL,
  },
};

const maker = (name: string, words: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'] as never,
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 3,
    oracleText: words,
    abilities,
  });

const spell = (name: string, words: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: words,
    spell: { effect },
  });

export const SYNTHETIC_SQUIRREL_G1_LIST: readonly CardDefinition[] = [
  maker(
    'SYNTHETIC Trinket Maker',
    'If you would create a Clue, Food, or Treasure token, instead create one of each.',
    [EACH_OF],
  ),
  maker(
    'SYNTHETIC Trinket Maker Twin',
    'If you would create a Clue, Food, or Treasure token, instead create one of each.',
    [EACH_OF],
  ),
  maker(
    'SYNTHETIC Squirrel Boss',
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
    [PLUS_THAT_MANY],
  ),
  maker(
    'SYNTHETIC Squirrel Boss Twin',
    'If one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.',
    [PLUS_THAT_MANY],
  ),
  spell('SYNTHETIC Clue Spell', 'Create a Clue token.', {
    kind: 'createToken',
    token: { kind: 'preset', preset: 'Clue' },
    count: 1,
  }),
  spell('SYNTHETIC Blood Spell', 'Create a Blood token.', {
    kind: 'createToken',
    token: { kind: 'preset', preset: 'Blood' },
    count: 1,
  }),
  // "Whenever a creature an opponent controls dies, you create a Blood token."
  singleFace({
    name: 'SYNTHETIC Blood Mourner',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Bat'] as never,
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'Whenever a creature an opponent controls dies, you create a Blood token.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { types: ['creature'], controller: 'opponent' } },
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Blood' }, count: 1 },
      },
    ],
  }),
  // "Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life."
  singleFace({
    name: 'SYNTHETIC Token Drainer',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Vampire'] as never,
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever a token you control leaves the battlefield, each opponent loses 1 life and you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'leavesBattlefield', what: { token: true, controller: 'you' } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
          ],
        },
      },
    ],
  }),
];
