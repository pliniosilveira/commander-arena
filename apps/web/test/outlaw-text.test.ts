import { expect, test } from 'vitest';
import { thingsPhrase } from '../src/game/filter-text';

// CR 700.12: the filter of "outlaw creatures you control" and "non-outlaw creatures" is worded with the word outlaw, never dropped (a dropped quality would say every creature).
test('an outlaw filter says outlaw', () => {
  expect(thingsPhrase({ types: ['creature'], outlaw: true, controller: 'you' }, true)).toBe(
    'outlaw creatures you control',
  );
  expect(thingsPhrase({ types: ['creature'], outlaw: false, controller: 'you' }, true)).toBe(
    'non-outlaw creatures you control',
  );
});
