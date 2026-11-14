import { expect, test } from 'vitest';
import { ENGINE_VERSION } from '../src/index';

test('engine exposes a positive integer version', () => {
  expect(Number.isInteger(ENGINE_VERSION)).toBe(true);
  expect(ENGINE_VERSION).toBeGreaterThan(0);
});
