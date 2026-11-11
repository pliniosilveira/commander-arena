/** The announce-X question (D-103, D-107) without a DOM: start, clamp, prompt, cost per X, keys. */
import { expect, test } from 'vitest';
import { activationCostPart } from '../src/game/cost-text';
import {
  clampX,
  initialX,
  perXText,
  typedX,
  xCostAt,
  xHeading,
  xKey,
  xPrompt,
} from '../src/ui/decisions/x-picker';

const perX = (mana: number, life = 0) => ({ perX: { mana, life } });

test('X starts at 1 when it can be 1, else at the minimum', () => {
  expect(initialX({ min: 0, max: 5 })).toBe(1);
  expect(initialX({ min: 0, max: 0 })).toBe(0);
  expect(initialX({ min: 2, max: 6 })).toBe(2);
});

test('X stays between the minimum and the most the player can pay', () => {
  const d = { min: 0, max: 4 };
  expect(clampX(d, 9)).toBe(4);
  expect(clampX(d, -3)).toBe(0);
  expect(clampX(d, 2.7)).toBe(2);
  expect(clampX(d, Number.NaN)).toBe(0);
});

test('what each X costs reads as the card does: one {X} is {1}, two {X} are {2}, pay X life', () => {
  expect(perXText(perX(1))).toBe('Each X costs {1}');
  expect(perXText(perX(2))).toBe('Each X costs {2}');
  expect(perXText(perX(0, 1))).toBe('Each X costs 1 life');
  expect(perXText(perX(1, 1))).toBe('Each X costs {1} and 1 life');
  expect(perXText(perX(0, 0))).toBe('X costs nothing extra');
});

test('the prompt names the source, what X costs and the most the player can afford', () => {
  const d = { sourceName: 'SYNTHETIC Fireball', purpose: 'spell', max: 6, ...perX(1) } as const;
  expect(xPrompt(d)).toBe(
    'Choose X for SYNTHETIC Fireball. Each X costs {1}; you can afford up to X = 6.',
  );
  expect(xPrompt({ ...d, ...perX(2), max: 3 })).toBe(
    'Choose X for SYNTHETIC Fireball. Each X costs {2}; you can afford up to X = 3.',
  );
  expect(xPrompt({ ...d, ...perX(0, 1), max: 39 })).toBe(
    'Choose X for SYNTHETIC Fireball. Each X costs 1 life; you can afford up to X = 39.',
  );
  expect(xPrompt({ ...d, sourceName: 'SYNTHETIC X Cannon', purpose: 'ability' })).toBe(
    "Choose X for SYNTHETIC X Cannon's ability. Each X costs {1}; you can afford up to X = 6.",
  );
  expect(xHeading({ sourceName: 'Pump', purpose: 'spell' })).toBe('Choose X for Pump.');
});

test('what a chosen X pays for the X part of the cost', () => {
  expect(xCostAt(perX(1), 3)).toBe('{3}');
  expect(xCostAt(perX(2), 3)).toBe('{6}');
  expect(xCostAt(perX(0, 1), 3)).toBe('3 life');
  expect(xCostAt(perX(1, 1), 2)).toBe('{2} and 2 life');
  expect(xCostAt(perX(0, 0), 2)).toBe('');
});

test('keys in the number field: arrows and pages step, Enter confirms, Esc cancels', () => {
  expect(xKey('ArrowUp')).toEqual({ kind: 'step', by: 1 });
  expect(xKey('ArrowDown')).toEqual({ kind: 'step', by: -1 });
  expect(xKey('PageUp')).toEqual({ kind: 'step', by: 5 });
  expect(xKey('PageDown')).toEqual({ kind: 'step', by: -5 });
  expect(xKey('Enter')).toEqual({ kind: 'confirm' });
  expect(xKey('Escape')).toEqual({ kind: 'cancel' });
  // Digits and editing keys belong to the field.
  expect(xKey('3')).toBeNull();
  expect(xKey('Backspace')).toBeNull();
});

test('typing digits: kept within the range, no leading zeros, empty reads as the minimum', () => {
  const d = { min: 0, max: 6 };
  expect(typedX(d, '3')).toEqual({ value: 3, shown: '3' });
  expect(typedX(d, '12')).toEqual({ value: 6, shown: '6' });
  expect(typedX(d, '03')).toEqual({ value: 3, shown: '3' });
  expect(typedX(d, '')).toEqual({ value: 0, shown: '' });
  expect(typedX(d, 'a4b')).toEqual({ value: 4, shown: '4' });
  expect(typedX({ min: 2, max: 6 }, '1')).toEqual({ value: 2, shown: '2' });
});

test('"pay X life" reads as printed', () => {
  expect(activationCostPart({ kind: 'payXLife' })).toBe('Pay X life');
});

test('the X of a "[-X]" loyalty ability costs loyalty counters (CR 606.5, D-200)', () => {
  const d = {
    perX: { mana: 0, life: 0, loyalty: 1 },
    sourceName: 'Ugin',
    purpose: 'ability',
    max: 3,
  } as const;
  expect(perXText(d)).toBe('Each X costs 1 loyalty');
  expect(xCostAt(d, 3)).toBe('3 loyalty');
  expect(xPrompt(d)).toBe(
    "Choose X for Ugin's ability. Each X costs 1 loyalty; you can afford up to X = 3.",
  );
});
