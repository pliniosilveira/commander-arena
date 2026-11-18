import { expect, test } from 'vitest';
import { thingsPhrase } from '../src/game/filter-text';

// CR 105.2, 205.4: the words of a filter that leaves a color out ("nonblack"), said as the cards print it.
test('thingsPhrase says "nonblack" for a filter with notColors', () => {
  expect(thingsPhrase({ types: ['creature'], notColors: ['B'] }, true)).toBe(
    'nonblack creatures on the battlefield',
  );
  expect(
    thingsPhrase({ types: ['creature'], notTypes: ['artifact'], notColors: ['B'] }, false),
  ).toBe('nonartifact nonblack creature on the battlefield');
});
