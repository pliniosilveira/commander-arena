import { describe, expect, test } from 'vitest';
import { handRise } from '../src/ui/board/Hand';

describe('how far a lifted hand card reaches above the hand area', () => {
  // A lifted card is 1.2 times its height and 14px up, with 8px for its outline.
  test('the whole lifted card fits in the area plus the rise', () => {
    for (const [cardH, shown] of [
      [169, 108],
      [169, 128],
      [194, 128], // text size 115%: the fixed 110px cut the title here
      [135, 88], // the table board: smaller cards, a shorter area
      [254, 108],
    ] as const) {
      expect(shown + handRise(cardH, shown)).toBeGreaterThanOrEqual(cardH * 1.2 + 14 + 8);
    }
  });

  test('the case that was cut: the rise is more than the old fixed 110px', () => {
    expect(handRise(194, 128)).toBeGreaterThan(110);
  });

  test('never negative', () => {
    expect(handRise(50, 128)).toBe(0);
  });
});
