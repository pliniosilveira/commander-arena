// Validation of what the mana and Treasure group of the Most Wanted deck needs: a mana ability that puts counters on its own permanent with a production that counts nothing
// (CR 605.3b, 122.6) and a sacrifice of itself with an amount that counts the counters on it (CR 113.7a). Cards are SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { type Ability, type CardDefinition, validateCard } from '../src/index';
import { singleFaceCard } from './dsl-helpers';

function artifact(...abilities: Ability[]): CardDefinition {
  return singleFaceCard({
    name: 'SYNTHETIC Stash Probe',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities,
  });
}

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

describe('a mana ability that puts counters on itself (CR 605.3b, 122.6)', () => {
  test('a production that counts nothing validates', () => {
    expect(
      validateCard(
        artifact({
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['R'] },
          putCounter: { counter: 'stash', count: 1 },
        }),
      ),
    ).toEqual([]);
  });

  test('a bad count is still refused', () => {
    expect(
      messages(
        artifact({
          kind: 'mana',
          cost: [{ kind: 'tap' }],
          production: { kind: 'fixed', mana: ['R'] },
          putCounter: { counter: 'stash', count: 0 },
        }),
      ),
    ).toEqual([expect.stringContaining('count must be a positive integer')]);
  });
});

describe('sacrificing itself for an amount that counts the counters on it (CR 113.7a, 605.3b)', () => {
  const sacrificeFor = (
    what: Extract<Ability, { kind: 'mana' }>['cost'][number],
    of: 'this' | 'other',
  ) =>
    artifact({
      kind: 'mana',
      cost: [{ kind: 'tap' }, what],
      production: {
        kind: 'anyColorAmount',
        amount: {
          kind: 'countersOn',
          counter: 'stash',
          of: of === 'this' ? { kind: 'this' } : { kind: 'triggerSubject' },
        },
      },
    });

  test('the sacrifice of this permanent validates when the amount counts its own counters', () => {
    expect(
      validateCard(sacrificeFor({ kind: 'sacrifice', what: { kind: 'this' } }, 'this')),
    ).toEqual([]);
  });

  test('the sacrifice of a permanent of a kind is still refused', () => {
    expect(
      messages(sacrificeFor({ kind: 'sacrifice', what: { types: ['creature'] } }, 'this')),
    ).toEqual([expect.stringContaining('counted before the costs are paid')]);
  });
});

describe('tokensInstead in eachOf mode (CR 614.1a)', () => {
  const eachOf = (tokens: unknown, extra: object = {}): CardDefinition =>
    artifact({
      kind: 'replacement',
      replacement: {
        kind: 'tokensInstead',
        what: { token: true },
        mode: 'eachOf',
        tokens,
        ...extra,
      } as never,
    });

  test('two or more different predefined tokens validate', () => {
    expect(validateCard(eachOf(['Clue', 'Food', 'Treasure']))).toEqual([]);
    expect(validateCard(eachOf(['Treasure', 'Gold']))).toEqual([]);
  });

  test('one token, a repeated one, an unknown one or one that needs an object are refused', () => {
    for (const tokens of [
      ['Treasure'],
      ['Treasure', 'Treasure'],
      ['Treasure', 'Blood'],
      ['Food', 'Wicked Role'],
    ]) {
      expect(messages(eachOf(tokens)), JSON.stringify(tokens)).toEqual([
        expect.stringContaining('one of each is of at least two different predefined tokens'),
      ]);
    }
  });

  test('it makes no token of its own', () => {
    expect(
      messages(eachOf(['Clue', 'Food'], { token: { kind: 'preset', preset: 'Treasure' } })),
    ).toEqual([expect.stringContaining('makes no token of its own')]);
  });
});
