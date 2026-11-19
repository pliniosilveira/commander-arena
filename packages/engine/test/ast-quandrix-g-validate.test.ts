// validateCard for the Quandrix Unlimited deck, group G (SYNTHETIC cards defined here): "distribute X +1/+1 counters among any number of target creatures" (CR 601.2d, 122.6), the
// base power filter (CR 208.4b), "enters with twice X counters" (CR 107.3m), the prime number condition and the odd or even power filter.
import { describe, expect, test } from 'vitest';
import { isFeatureSupported } from '../src/ast/features';
import type { Ability, Effect, SpellText } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const issues = (card: ReturnType<typeof singleFace>) =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);

const FILTER = { types: ['creature' as const], controller: 'you' as const };
const sorcery = (spell: SpellText, cost = ['X', 'G']) =>
  singleFace({
    name: 'SYNTHETIC Test Distribute',
    manaCost: cost,
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'test',
    spell,
  });
const distribute = (id = 't1'): Effect => ({
  kind: 'distributeCounters',
  to: { kind: 'target', id },
  counter: '+1/+1',
});
const slot = (total: unknown) => ({
  id: 't1',
  what: { kind: 'object' as const, filter: FILTER },
  divide: { total: total as never },
});

describe('the registry lists what the engine runs', () => {
  test.each([
    'effect:distributeCounters',
    'condition:amountIsPrime',
    'selector:basePowerIs',
    'selector:powerParity',
  ] as const)('%s', (ref) => {
    expect(isFeatureSupported(ref)).toBe(true);
  });
});

describe('distributeCounters', () => {
  test('the total may be the X the spell announces', () => {
    const card = sorcery({ targets: [slot({ kind: 'x' })], effect: distribute(), x: true });
    expect(issues(card)).toEqual([]);
  });

  test('a number is a total too', () => {
    expect(issues(sorcery({ targets: [slot(3)], effect: distribute() }, ['G']))).toEqual([]);
  });

  test('X needs the spell to announce one', () => {
    expect(issues(sorcery({ targets: [slot({ kind: 'x' })], effect: distribute() })).length).toBe(
      1,
    );
  });

  test('a slot that divides something needs the effect that gives it out, and the other way round', () => {
    expect(
      issues(
        sorcery(
          { targets: [slot(3)], effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
          ['G'],
        ),
      ).length,
    ).toBeGreaterThan(0);
    const noDivide = {
      id: 't1',
      what: { kind: 'object' as const, filter: FILTER },
    };
    expect(
      issues(sorcery({ targets: [noDivide], effect: distribute() }, ['G'])).length,
    ).toBeGreaterThan(0);
  });

  test('an ability does not announce an X before its targets: a division of X is refused there', () => {
    const ability: Ability = {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['X', 'G'] }],
      targets: [slot({ kind: 'x' })],
      effect: distribute(),
    } as never;
    const card = singleFace({
      name: 'SYNTHETIC Test Distribute Ability',
      manaCost: ['1'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: 'test',
      abilities: [ability],
    });
    expect(issues(card).length).toBeGreaterThan(0);
  });
});

describe('the filters', () => {
  const where = (filter: unknown): Effect => ({
    kind: 'moveToZone',
    objects: { kind: 'each', filter: filter as never },
    to: 'hand',
  });

  test('a base power and a parity are valid', () => {
    expect(
      issues(sorcery({ effect: where({ types: ['creature'], basePowerIs: 0 }) }, ['G'])),
    ).toEqual([]);
    expect(
      issues(sorcery({ effect: where({ types: ['creature'], powerParity: 'odd' }) }, ['G'])),
    ).toEqual([]);
  });

  test.each([
    ['a base power that is not whole', { basePowerIs: 1.5 }],
    ['a parity that is neither', { powerParity: 'prime' }],
  ])('%s is refused', (_label, filter) => {
    expect(issues(sorcery({ effect: where(filter) }, ['G'])).length).toBeGreaterThan(0);
  });
});

describe('enters with twice X counters', () => {
  const creature = (count: unknown, cost: string[]) =>
    singleFace({
      name: 'SYNTHETIC Test Twice X',
      manaCost: cost,
      types: ['creature'],
      colors: ['G'],
      colorIdentity: ['G'],
      power: 0,
      toughness: 0,
      oracleText: 'test',
      abilities: [
        {
          kind: 'replacement',
          replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: count as never },
        },
      ],
    });

  test('X multiplied by 2 or more is valid, by 1 or a fraction is not', () => {
    expect(issues(creature({ kind: 'x', times: 2 }, ['X', 'G']))).toEqual([]);
    expect(issues(creature({ kind: 'x', times: 3 }, ['X', 'G']))).toEqual([]);
    expect(issues(creature({ kind: 'x', times: 1 }, ['X', 'G'])).length).toBeGreaterThan(0);
    expect(issues(creature({ kind: 'x', times: 2.5 }, ['X', 'G'])).length).toBeGreaterThan(0);
  });

  test('it still needs an {X} in the mana cost (CR 107.3m)', () => {
    expect(issues(creature({ kind: 'x', times: 2 }, ['G'])).length).toBeGreaterThan(0);
  });
});

describe('amountIsPrime', () => {
  const trigger = (amount: unknown) =>
    singleFace({
      name: 'SYNTHETIC Test Prime',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'endStep', whose: 'you' },
          interveningIf: { kind: 'amountIsPrime', amount: amount as never },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        } as never,
      ],
    });

  test('a count of the game is valid', () => {
    expect(
      issues(trigger({ kind: 'countOf', filter: { types: ['land'], controller: 'you' } })),
    ).toEqual([]);
  });

  test('an amount that needs the resolution (X, the damage of a trigger) is refused', () => {
    expect(issues(trigger({ kind: 'x' })).length).toBeGreaterThan(0);
    expect(issues(trigger({ kind: 'triggerDamage' })).length).toBeGreaterThan(0);
  });
});
