// Validation of `enterAttacking` in the effect of an `attackBatch` trigger ("Whenever you attack, create a tapped and attacking token", CR 508.4): allowed there as in an
// `attacks` trigger, refused in any other ability.
import { describe, expect, test } from 'vitest';
import { type Ability, type CardDefinition, type Effect, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const TOKEN: Effect = {
  kind: 'createToken',
  token: {
    kind: 'custom',
    definition: {
      name: 'Dinosaur',
      manaCost: null,
      supertypes: [],
      types: ['creature'],
      subtypes: ['Dinosaur'],
      colors: ['G'],
      power: 2,
      toughness: 2,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
    },
  },
  count: 1,
  tapped: true,
} as Effect;
const ENTER: Effect = { kind: 'enterAttacking', objects: { kind: 'moved' } };
const BODY: Effect = { kind: 'sequence', effects: [TOKEN, ENTER] };

function creature(ability: Ability): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Validation Probe',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Treefolk'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [ability],
  });
}

describe('enterAttacking in a trigger', () => {
  test('is valid in an attackBatch trigger', () => {
    const card = creature({
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1 },
      effect: BODY,
    });
    expect(validateCard(card)).toEqual([]);
  });

  test('is refused in a trigger that is not about an attack', () => {
    const card = creature({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      effect: BODY,
    } as Ability);
    expect(validateCard(card).map((i) => i.message)).toContain(
      'a creature enters attacking in a triggered ability of an attack',
    );
  });
});
