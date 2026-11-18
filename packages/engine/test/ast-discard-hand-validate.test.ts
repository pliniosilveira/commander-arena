// "Discard your hand" as the cost of an activated ability (D-610, issue 160): what a card may say.
import { describe, expect, test } from 'vitest';
import { type Cost, syntheticCard, validateCard } from '../src/index';

const withCost = (cost: Cost) => {
  const card = syntheticCard('SYNTHETIC Chapel Scribe');
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...card,
    faces: [
      {
        ...face,
        abilities: [
          {
            kind: 'activated' as const,
            cost: [cost],
            effect: { kind: 'draw' as const, player: { kind: 'you' as const }, count: 1 },
          },
        ],
      },
    ],
  };
};
const messages = (card: ReturnType<typeof withCost>) =>
  validateCard(card)
    .map((m) => m.message)
    .join(' | ');

describe('the whole hand as a cost', () => {
  test('a count of 0 with hand true is a cost', () => {
    expect(messages(withCost({ kind: 'discard', count: 0, hand: true }))).toBe('');
  });

  test('with a count, a filter or a name it is not', () => {
    expect(messages(withCost({ kind: 'discard', count: 1, hand: true }))).toMatch(/hand is true/);
    expect(
      messages(withCost({ kind: 'discard', count: 0, hand: true, filter: { types: ['land'] } })),
    ).toMatch(/hand is true/);
    expect(messages(withCost({ kind: 'discard', count: 0, hand: true, named: true }))).toMatch(
      /hand is true/,
    );
  });

  test('the other discard costs still need a positive count', () => {
    expect(messages(withCost({ kind: 'discard', count: 0 }))).toMatch(/positive integer/);
  });
});
