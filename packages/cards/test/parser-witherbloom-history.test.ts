import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('Witherbloom event-history grammar', () => {
  test('a defined X is the controller life gained, not the current life difference', () => {
    const p = readAll(
      'At the beginning of your end step, each opponent loses X life, where X is the amount of life you gained this turn.',
      'creature',
    );
    expect(p.abilities[0]).toMatchObject({
      effect: { kind: 'loseLife', amount: { kind: 'lifeGainedThisTurn' } },
    });
  });
  test('a Food count reads nontoken entries, not the current board', () => {
    const p = readAll(
      'At the beginning of your end step, create a number of Food tokens equal to the number of nontoken creatures you had enter the battlefield under your control this turn.',
      'creature',
    );
    expect(p.abilities[0]).toMatchObject({
      effect: {
        kind: 'createToken',
        count: { kind: 'enteredThisTurn', controller: 'you', types: ['creature'], token: false },
      },
    });
  });
  test('a conditional cost reduction reuses the actual life gain condition', () => {
    const p = readAll(
      'This spell costs {2} less to cast if you gained life this turn.\nDestroy target nonland permanent.',
    );
    expect(p.abilities[0]).toMatchObject({
      kind: 'static',
      static: { kind: 'costReduction' },
      condition: { kind: 'lifeGainedThisTurn', atLeast: 1 },
    });
  });
  test('plural entering creatures receive counters from death history', () => {
    const p = readAll(
      'Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature that died under your control this turn.',
      'creature',
    );
    expect(p.abilities[0]).toMatchObject({
      kind: 'replacement',
      replacement: {
        kind: 'othersEnterWithCounters',
        what: { token: false, types: ['creature'], controller: 'you' },
        count: { kind: 'diedThisTurn', types: ['creature'], controller: 'you' },
      },
    });
  });
  test.each([
    'At the beginning of your end step, each opponent loses X life, where X is the amount of life an opponent gained this turn.',
    'At the beginning of your end step, each opponent loses X life, where X is the amount of life you gained last turn.',
    'At the beginning of your end step, create a number of Food tokens equal to the number of nontoken creatures you had enter the battlefield under your control last turn.',
    'Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature that died this turn.',
    'Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature card that died under your control this turn.',
    'Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature that died under your control this game.',
  ])('refuses nearby unsupported history: %s', (text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
