// A token a spell creates has abilities of its own (CR 111.4, 113.1): "that player" in a triggered ability of the token is the player of the token's event, which is a trigger
// the spell does not have. The spell's own words are still refused when they name the player of an event. The cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Ability, TokenDefinition } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

const TAKE: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'player' },
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'battlefield', types: ['artifact'], controller: 'triggerPlayer' },
      },
    },
  ],
  effect: {
    kind: 'gainControl',
    objects: { kind: 'target', id: 't1' },
    duration: 'permanent',
  },
};

const token = (abilities: readonly Ability[]): TokenDefinition => ({
  name: 'SYNTHETIC Taker',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['B'],
  power: 2,
  toughness: 2,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities,
});

const spellOf = (definition: TokenDefinition) =>
  singleFace({
    name: 'SYNTHETIC Token Maker',
    manaCost: ['3'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC',
    spell: {
      effect: { kind: 'createToken', count: 1, token: { kind: 'custom', definition } },
    },
  });

describe('the triggered ability of a token a spell creates', () => {
  test('may name the player of its own event', () => {
    expect(validateCard(spellOf(token([TAKE])))).toEqual([]);
  });

  test('may not when its trigger has no player', () => {
    const noPlayer: Ability = {
      ...TAKE,
      trigger: { kind: 'dealsCombatDamage', what: { kind: 'this' }, to: 'creature' },
    };
    expect(validateCard(spellOf(token([noPlayer]))).length).toBeGreaterThan(0);
  });

  test('the spell itself still has no player of an event', () => {
    const card = singleFace({
      name: 'SYNTHETIC Player Of Nothing',
      manaCost: ['3'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC',
      spell: {
        effect: {
          kind: 'gainControl',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['artifact'], controller: 'triggerPlayer' },
          },
          duration: 'permanent',
        },
      },
    });
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});
