// The memory of failed image loads: a picture that failed is not asked for again at once, but not given up for the session either.
import { expect, test } from 'vitest';
import { createFailureMemory, RETRY_AFTER_MS } from '../src/ui/board/lookup-cache';

test('a failed picture is skipped for the wait and tried again after it', () => {
  let clock = 1000;
  const failed = createFailureMemory(() => clock);
  expect(failed.has('a')).toBe(false);
  failed.mark('a');
  expect(failed.has('a')).toBe(true);
  expect(failed.has('b')).toBe(false);
  clock += RETRY_AFTER_MS - 1;
  expect(failed.has('a')).toBe(true);
  clock += 1;
  expect(failed.has('a')).toBe(false);
});

test('clearing a failure lets the picture be asked for at once', () => {
  const failed = createFailureMemory(() => 0);
  failed.mark('a');
  failed.clear('a');
  expect(failed.has('a')).toBe(false);
});
