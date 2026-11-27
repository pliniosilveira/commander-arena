// The memory of failed image loads: a picture that failed is not asked for again at once, but not given up for the session either.
import { expect, test } from 'vitest';
import { createFailureMemory, RETRY_AFTER_MS, retryDelayMs } from '../src/ui/board/lookup-cache';

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

test('a picture that fails again waits longer each time, up to four times the first wait', () => {
  expect([0, 1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([
    30_000, 60_000, 120_000, 240_000, 240_000, 240_000,
  ]);
});
