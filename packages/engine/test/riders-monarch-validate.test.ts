// Validation of the nodes the monarch cards of the Riders of Rohan deck use (CR 725.2, 603.7, 118.12a, 508.1a). SYNTHETIC cards: only the shape is checked, the play is in the cards package.
import { describe, expect, test } from 'vitest';
import { type Ability, type CardDefinition, type Effect, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

const withAbility = (ability: Ability): CardDefinition =>
  singleFaceCard({
    name: 'SYNTHETIC Monarch Shape',
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: '',
    abilities: [ability],
  });

const issues = (ability: Ability) => validateCard(withAbility(ability)).map((i) => i.message);

const DRAW = { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 } as const;

describe('step trigger of the monarch', () => {
  test('is valid', () => {
    expect(
      issues({
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'monarch' },
        effect: DRAW,
      }),
    ).toEqual([]);
  });
  test('another turn owner is not', () => {
    expect(
      issues({
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'nobody' as never },
        effect: DRAW,
      }),
    ).not.toEqual([]);
  });
});

describe('unlessPays with the hand size as X', () => {
  const payer = (cost: readonly { kind: 'mana'; symbols: string[] }[], xIsHandSize = true) =>
    issues({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'opponent' },
      effect: {
        kind: 'unlessPays',
        player: { kind: 'triggerPlayer' },
        cost,
        ...(xIsHandSize ? { xIsHandSize: true as const } : {}),
        effect: {
          kind: 'creaturesCantAttackYou',
          creatures: { types: ['creature'] },
          duration: 'thisCombat',
          player: { kind: 'triggerPlayer' },
        },
      },
    });
  test('a cost of {X} is valid', () => {
    expect(payer([{ kind: 'mana', symbols: ['X'] }])).toEqual([]);
  });
  test('{X} without the hand size is not (no X is announced for it)', () => {
    expect(payer([{ kind: 'mana', symbols: ['X'] }], false)).not.toEqual([]);
  });
  test('a cost with other symbols and the hand size is not', () => {
    expect(payer([{ kind: 'mana', symbols: ['X', '1'] }])).not.toEqual([]);
  });
});

describe('delayedCombatDamageBatchTurn', () => {
  const made = (filter: object) =>
    issues({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } } as never,
      effect: {
        kind: 'delayedCombatDamageBatchTurn',
        filter,
        effect: { kind: 'becomeMonarch', player: { kind: 'you' } },
      } as Effect,
    });
  test('creatures you control are valid', () => {
    expect(made({ types: ['creature'], controller: 'you' })).toEqual([]);
  });
  test('creatures of any controller are not', () => {
    expect(made({ types: ['creature'] })).not.toEqual([]);
  });
});
