import { expect, test } from 'vitest';
import { PARSER_VERSION } from '../src/index';

test('parser exposes a positive integer version', () => {
  expect(Number.isInteger(PARSER_VERSION)).toBe(true);
  expect(PARSER_VERSION).toBeGreaterThan(0);
});
