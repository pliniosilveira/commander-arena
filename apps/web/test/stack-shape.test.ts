import { describe, expect, test } from 'vitest';
import { MAX_BEHIND, stackShape } from '../src/ui/board/stack-shape';

describe('the shape of a stack of equal permanents', () => {
  test('one card behind the front one for each other copy', () => {
    expect(stackShape(1)).toEqual({ behind: 0, dx: 0, dy: 0, extraW: 0 });
    expect(stackShape(2).behind).toBe(1);
    expect(stackShape(5).behind).toBe(4);
    expect(stackShape(13).behind).toBe(12);
  });

  test('a short stack shows 9 pixels of each card; a long one closes up, never under 3', () => {
    expect(stackShape(2).dx).toBe(9);
    expect(stackShape(9).dx).toBe(9);
    expect(stackShape(13).dx).toBe(6);
    expect(stackShape(25).dx).toBe(3);
    expect(stackShape(60).dx).toBe(3);
  });

  test('the cards drawn stop at the widest spread, and the room beside the tile with them', () => {
    expect(stackShape(60).behind).toBe(MAX_BEHIND);
    expect(stackShape(60).extraW).toBe(stackShape(25).extraW);
    // One card behind fits in the room the smaller front card leaves.
    expect(stackShape(2).extraW).toBe(0);
    expect(stackShape(5).extraW).toBe(24);
  });

  test('the cards behind never rise above the tile', () => {
    for (const count of [2, 3, 5, 13, 25, 60]) {
      const s = stackShape(count);
      expect(s.behind * s.dy).toBeLessThanOrEqual(11);
    }
  });
});
