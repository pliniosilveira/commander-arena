// Validation of the nodes of group 3 of the Lorehold Spirit deck (D-622 and later): the condition `aPlayerCardsInHand` (as the intervening "if" of a trigger) and the `hand` flag of the
// `discard` effect ("Each player discards their hand"). A node the engine does not run, or runs in one shape only, is refused with a message, never accepted and half run.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, syntheticCard, validateCard } from '../src/index';

const CARD = 'SYNTHETIC Lore Jackal // Spin of Fate';
const EMPTY = 'SYNTHETIC Empty Hands';
const EACH = { kind: 'eachPlayer' } as const;

const messages = (card: CardDefinition) => validateCard(card).map((i) => i.message);

/** The Jackal with the intervening "if" of its trigger replaced. */
function withCondition(condition: unknown): CardDefinition {
  const card = syntheticCard(CARD);
  const [front, ...rest] = card.faces;
  if (front === undefined) throw new Error('no face');
  const [trigger] = front.abilities;
  return {
    ...card,
    faces: [
      { ...front, abilities: [{ ...(trigger as object), interveningIf: condition }] },
      ...rest,
    ],
  } as never;
}

/** The sorcery that discards hands with its effect replaced. */
function withEffect(effect: unknown): CardDefinition {
  const card = syntheticCard(EMPTY);
  const [face] = card.faces;
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
}

describe('the cards are valid', () => {
  test.each([CARD, EMPTY])('%s', (name) => {
    expect(messages(syntheticCard(name))).toEqual([]);
  });
});

describe('`aPlayerCardsInHand` (CR 402.1, 603.4)', () => {
  test('a comparison with a whole number, in any of the three forms, is valid', () => {
    for (const cmp of ['atMost', 'atLeast', 'equal']) {
      expect(
        messages(withCondition({ kind: 'aPlayerCardsInHand', compare: { cmp, value: 1 } })),
      ).toEqual([]);
    }
  });

  test('an unknown comparison or a fractional number is refused', () => {
    expect(
      messages(
        withCondition({ kind: 'aPlayerCardsInHand', compare: { cmp: 'under', value: 1 } }),
      ).join(),
    ).toContain('unknown comparison');
    expect(
      messages(
        withCondition({ kind: 'aPlayerCardsInHand', compare: { cmp: 'atMost', value: 1.5 } }),
      ).join(),
    ).toContain('whole number');
  });

  test('a missing comparison is refused', () => {
    expect(messages(withCondition({ kind: 'aPlayerCardsInHand' })).length).toBeGreaterThan(0);
  });
});

describe('`discard` with `hand` (CR 701.9a)', () => {
  test('a count of 0 and nothing else is valid', () => {
    expect(messages(withEffect({ kind: 'discard', player: EACH, count: 0, hand: true }))).toEqual(
      [],
    );
  });

  test.each([
    ['a count above 0', { count: 2 }],
    ['any number', { anyNumber: true }],
    ['"unless you discard"', { unless: { types: ['artifact'] } }],
    ['at random', { random: true }],
    ['a hand that is not true', { hand: false }],
  ])('%s is refused', (_label, extra) => {
    const effect = { kind: 'discard', player: EACH, count: 0, hand: true, ...extra };
    expect(messages(withEffect(effect)).join()).toContain('hand is true');
  });
});
