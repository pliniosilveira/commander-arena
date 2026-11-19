// "As long as ~ has N or more +1/+1 counters on it" (CR 122.1, 611.3a, 613.8): a static ability's condition may read the counters on this permanent (they belong to no layer),
// and only those. Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const withCondition = (of: unknown) => {
  const base = syntheticCard('SYNTHETIC Field Marshal');
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  const condition = {
    kind: 'amountIs',
    amount: { kind: 'countersOn', of, counter: '+1/+1' },
    compare: { cmp: 'atLeast', value: 10 },
  };
  const abilities = [
    {
      kind: 'static',
      condition,
      static: { kind: 'grantKeyword', subject: { kind: 'this' }, keyword: 'trample' },
    },
  ];
  return { ...base, faces: [{ ...face, abilities }] } as never;
};
const messages = (card: never) =>
  validateCard(card)
    .map((i) => i.message)
    .join(' | ');

describe('a static ability reads the counters on this permanent', () => {
  test('countersOn of this is accepted', () => {
    expect(messages(withCondition({ kind: 'this' }))).not.toContain('counters on this');
    expect(messages(withCondition({ kind: 'this' }))).not.toContain('condition compares');
  });

  test('the counters of another object are not', () => {
    expect(messages(withCondition({ kind: 'attached' }))).toContain(
      'counters on this permanent only',
    );
  });
});
