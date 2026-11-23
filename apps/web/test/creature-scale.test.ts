import { describe, expect, test } from 'vitest';
import { TABLE_CREATURE_SCALE } from '../src/ui/board/creature-scale';
import { rowSpec } from '../src/ui/board/Row';

describe('creature tile scale on the table board (issue 560)', () => {
  test('the table draws creature tiles 10% smaller', () => {
    const full = rowSpec('creature', 400);
    const table = rowSpec('creature', 400, 0, TABLE_CREATURE_SCALE);
    expect(TABLE_CREATURE_SCALE).toBe(0.9);
    expect(table.tileH).toBe(Math.round(full.tileH * 0.9));
    expect(table.preferredW).toBeLessThan(full.preferredW);
  });
});
