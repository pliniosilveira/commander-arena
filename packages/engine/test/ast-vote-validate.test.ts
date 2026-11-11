// The validator of voting (D-194): the effect `vote` (CR 701.38a, 701.38b) and the amount `votesFor`.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { SUPPORTED_FEATURES, syntheticCard, validateCard } from '../src/index';

const RITE = 'SYNTHETIC Ballot Rite';

const withEffect = (effect: Effect) => {
  const card = syntheticCard(RITE);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return { ...card, faces: [{ ...face, spell: { effect } }] } as never;
};
const vote = (extra: Record<string, unknown> = {}): Effect =>
  ({ kind: 'vote', options: ['gold', 'iron'], startingWith: 'you', ...extra }) as never;
const gain = (option: string): Effect => ({
  kind: 'gainLife',
  player: { kind: 'you' },
  amount: { kind: 'votesFor', option },
});
const sequence = (...effects: Effect[]): Effect => ({ kind: 'sequence', effects });
const messages = (effect: Effect) => validateCard(withEffect(effect)).map((i) => i.message);

describe('the supported features', () => {
  test('the effect and the amount are listed', () => {
    expect(SUPPORTED_FEATURES.effectKinds).toContain('vote');
    expect(SUPPORTED_FEATURES.amountKinds).toContain('votesFor');
  });
});

describe('vote', () => {
  test('two to eight distinct options, starting with "you", are valid', () => {
    expect(messages(vote())).toEqual([]);
    expect(messages(vote({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }))).toEqual([]);
  });

  test('one option or nine are refused', () => {
    expect(messages(vote({ options: ['gold'] })).join()).toMatch(/two to eight options/);
    expect(
      messages(vote({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })).join(),
    ).toMatch(/two to eight options/);
  });

  test('a repeated option and an empty one are refused', () => {
    expect(messages(vote({ options: ['gold', 'gold'] })).join()).toMatch(/both "gold"/);
    expect(messages(vote({ options: ['gold', ' '] })).join()).toMatch(/needs its words/);
  });

  test('only the controller can start the vote', () => {
    expect(messages(vote({ startingWith: 'opponent' })).join()).toMatch(/starts with "you"/);
  });
});

describe('votesFor', () => {
  test('after a vote that offers the option it is valid, also inside a multiple', () => {
    expect(messages(sequence(vote(), gain('gold'), gain('iron')))).toEqual([]);
    expect(
      messages(
        sequence(vote(), {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'multiple', factor: 2, of: { kind: 'votesFor', option: 'gold' } },
        }),
      ),
    ).toEqual([]);
  });

  test('without a vote before it, it is refused', () => {
    expect(messages(sequence(gain('gold'))).join()).toMatch(/needs a vote effect before it/);
    expect(messages(sequence(gain('gold'), vote())).join()).toMatch(/needs a vote effect/);
  });

  test('an option the vote does not offer is refused', () => {
    expect(messages(sequence(vote(), gain('ash'))).join()).toMatch(/not an option of the vote/);
  });

  test('it needs the option named', () => {
    expect(messages(sequence(vote(), gain(''))).join()).toMatch(/names the option/);
  });
});
