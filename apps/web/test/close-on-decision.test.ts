import { expect, test } from 'vitest';
import { closesList } from '../src/ui/board/useCloseOnDecision';

// Issue 23: a zone list opened by hand over a question must go when the question is answered.
test('a list closes when a new question other than priority appears', () => {
  expect(closesList('priority', 'targets')).toBe(true);
  expect(closesList(null, 'targets')).toBe(true);
  expect(closesList('targets', 'payMana')).toBe(true);
});

test('a list closes when the question it was opened over is answered', () => {
  expect(closesList('targets', 'priority')).toBe(true);
  expect(closesList('targets', null)).toBe(true);
  expect(closesList('payMana', 'priority')).toBe(true);
});

test('a list opened at priority stays while the player still has priority', () => {
  expect(closesList('priority', 'priority')).toBe(false);
  expect(closesList('priority', null)).toBe(false);
  expect(closesList(null, 'priority')).toBe(false);
});

test('the same question twice in a row changes nothing', () => {
  expect(closesList('targets', 'targets')).toBe(false);
});
