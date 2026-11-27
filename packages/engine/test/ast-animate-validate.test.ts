// The static `animate` ability (Bello, Bard of the Brambles; CR 613.1d, 613.1f, 613.4b, 613.6): what the validator accepts and refuses. SYNTHETIC card.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

function card(ability: Ability): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Animator',
    manaCost: ['2'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
    abilities: [ability],
  });
}

const GROUP = { kind: 'filter', filter: { types: ['artifact'], controller: 'you' } } as const;
const animate = {
  kind: 'animate',
  subject: GROUP,
  types: ['creature'],
  subtypes: ['Elemental'],
  power: 4,
  toughness: 4,
  keywords: [{ kind: 'haste' }],
} as const;

describe('animate', () => {
  test('a group, creature, a size, keywords, and a plain condition are valid', () => {
    expect(validateCard(card({ kind: 'static', static: animate }))).toEqual([]);
    expect(
      validateCard(card({ kind: 'static', static: animate, condition: { kind: 'yourTurn' } })),
    ).toEqual([]);
  });

  test('the subject is a group, never `this`', () => {
    const bad = { ...animate, subject: { kind: 'this' } } as unknown as Ability;
    expect(
      validateCard(card({ kind: 'static', static: bad } as unknown as Ability)).length,
    ).toBeGreaterThan(0);
  });

  test('the group cannot compare power or toughness: it is found in layer 4', () => {
    const bad = {
      ...animate,
      subject: {
        kind: 'filter',
        filter: { types: ['artifact'], power: { cmp: 'atLeast', value: 1 } },
      },
    };
    expect(
      validateCard(card({ kind: 'static', static: bad } as unknown as Ability)).length,
    ).toBeGreaterThan(0);
  });

  test('a condition that reads a characteristic is refused', () => {
    const bad = {
      kind: 'static',
      static: animate,
      condition: { kind: 'thisMatches', filter: { types: ['creature'] } },
    } as unknown as Ability;
    expect(validateCard(card(bad)).length).toBeGreaterThan(0);
  });

  test('a keyword with parameters and no card types are refused', () => {
    const withParams = {
      ...animate,
      keywords: [{ kind: 'ward', cost: [{ kind: 'mana', symbols: ['1'] }] }],
    };
    expect(
      validateCard(card({ kind: 'static', static: withParams } as unknown as Ability)).length,
    ).toBeGreaterThan(0);
    const noTypes = { ...animate, types: [] };
    expect(
      validateCard(card({ kind: 'static', static: noTypes } as unknown as Ability)).length,
    ).toBeGreaterThan(0);
  });
});
