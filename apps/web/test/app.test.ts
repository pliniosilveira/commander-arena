import { expect, test } from 'vitest';
import { App } from '../src/App';

test('App is a component function', () => {
  expect(typeof App).toBe('function');
});
