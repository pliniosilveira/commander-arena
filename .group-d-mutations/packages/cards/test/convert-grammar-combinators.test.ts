// The combinators S1 added to the parser kit: many, optional, satisfy, chain and named.
import { describe, expect, test } from 'vitest';
import {
  chain,
  choice,
  literal,
  many,
  map,
  named,
  optional,
  pattern,
  runWhole,
  satisfy,
  sequence,
} from '../src/convert/parser/index';

describe('many and optional', () => {
  test('many reads zero or more and never fails', () => {
    const p = sequence(many(literal('a')), literal('b'));
    expect(runWhole(p, 'b')).toEqual({ ok: true, value: [[], 'b'] });
    expect(runWhole(p, 'aaab')).toEqual({ ok: true, value: [['a', 'a', 'a'], 'b'] });
  });

  test('many stops on a parser that matches nothing, so it cannot loop', () => {
    expect(runWhole(sequence(many(optional(literal('x'), null)), literal('y')), 'y').ok).toBe(true);
  });

  test('optional gives the fallback and consumes nothing', () => {
    const p = sequence(optional(literal('-'), 'none'), literal('1'));
    expect(runWhole(p, '1')).toEqual({ ok: true, value: ['none', '1'] });
    expect(runWhole(p, '-1')).toEqual({ ok: true, value: ['-', '1'] });
  });
});

describe('satisfy and chain', () => {
  const digit = map(pattern(/\d/), (m) => Number(m[0]));

  test('satisfy fails where the parser started when the value is refused', () => {
    const big = satisfy(digit, (n) => n >= 5);
    expect(runWhole(big, '7')).toEqual({ ok: true, value: 7 });
    expect(runWhole(big, '3')).toEqual({ ok: false, progress: 0, rule: null });
  });

  test('chain builds the next parser from the value before it', () => {
    // A count, then that many "x".
    const p = chain(digit, (n) => map(literal('x'.repeat(n)), () => n));
    expect(runWhole(p, '3xxx')).toEqual({ ok: true, value: 3 });
    expect(runWhole(p, '3xx').ok).toBe(false);
  });
});

describe('named', () => {
  const clause = (id: string, word: string) =>
    named(id, sequence(literal(`${word} `), literal('thing')));
  const text = choice(clause('rule.alpha', 'Alpha'), clause('rule.beta', 'Beta'));

  test('a name that failed after its start is the closest rule', () => {
    expect(runWhole(text, 'Beta stuff')).toEqual({ ok: false, progress: 5, rule: 'rule.beta' });
  });

  test('a name that matched nothing is never reported', () => {
    expect(runWhole(text, 'Gamma thing')).toEqual({ ok: false, progress: 0, rule: null });
  });

  test('a name that matched right up to where the text stopped is reported', () => {
    expect(runWhole(sequence(clause('rule.alpha', 'Alpha'), literal('.')), 'Alpha thing!')).toEqual(
      {
        ok: false,
        progress: 11,
        rule: 'rule.alpha',
      },
    );
  });

  test('the innermost name wins over the name around it', () => {
    const inner = named('inner', sequence(literal('a'), literal('b')));
    const outer = named('outer', sequence(literal('x'), inner));
    expect(runWhole(outer, 'xac')).toEqual({ ok: false, progress: 2, rule: 'inner' });
  });
});
