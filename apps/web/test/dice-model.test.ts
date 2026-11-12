// What the web says about a die roll (D-271): the log line of the `dieRolled` event (CR 706.2) and the words of the conditions that read the result and the
// card in the graveyard.
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { describeEvent } from '../src/game/describe';

const state = { objects: {}, cards: {}, seats: [] } as never;

describe('the log of a die roll', () => {
  test('the line names the size of the die and the result, for either seat', () => {
    expect(
      describeEvent({ kind: 'dieRolled', seat: 0, sides: 4, result: 3 }, state, state, 0),
    ).toMatchObject({ text: 'You roll a 4-sided die: 3.' });
    expect(
      describeEvent({ kind: 'dieRolled', seat: 1, sides: 20, result: 17 }, state, state, 0)?.text,
    ).toMatch(/rolls a 20-sided die: 17\.$/);
  });
});

describe('the words of the conditions', () => {
  test('the result of a die', () => {
    const at = (cmp: 'atLeast' | 'atMost' | 'equal', value: number) =>
      gameConditionWords({ kind: 'dieResult', compare: { cmp, value } });
    expect(at('equal', 1)).toBe('the result is 1');
    expect(at('atLeast', 4)).toBe('the result is 4 or more');
    expect(at('atMost', 2)).toBe('the result is 2 or less');
    expect(
      gameConditionWords({
        kind: 'not',
        term: { kind: 'dieResult', compare: { cmp: 'equal', value: 1 } },
      }),
    ).toBe("it's not true that the result is 1");
  });

  test('a card in the graveyard', () => {
    expect(gameConditionWords({ kind: 'thisInYourGraveyard' })).toBe(
      'this card is in your graveyard',
    );
    expect(gameConditionWords({ kind: 'not', term: { kind: 'thisInYourGraveyard' } })).toBe(
      'this card is not in your graveyard',
    );
  });
});
