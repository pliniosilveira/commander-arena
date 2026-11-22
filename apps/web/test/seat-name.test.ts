import { describe, expect, test } from 'vitest';
import { possessiveOf, seatNameOf } from '../src/game/seat-name';
import { turnLabel, turnOwner } from '../src/game/turn-label';

describe('seat names with several opponents', () => {
  test('the 1v1 words do not change, with or without the seat count', () => {
    expect(seatNameOf(0, 0)).toBe('You');
    expect(seatNameOf(1, 0)).toBe('Opponent');
    expect(seatNameOf(1, 0, 2)).toBe('Opponent');
    expect(possessiveOf(0, 0, 2)).toBe('Your');
    expect(possessiveOf(1, 0, 2)).toBe("Opponent's");
  });

  test('three and four seats number the opponents in seat order', () => {
    expect([0, 1, 2, 3].map((s) => seatNameOf(s, 0, 4))).toEqual([
      'You',
      'Opponent 1',
      'Opponent 2',
      'Opponent 3',
    ]);
    expect(possessiveOf(2, 0, 3)).toBe("Opponent 2's");
  });

  test('the numbering skips the viewer wherever they sit', () => {
    expect(seatNameOf(0, 1, 3)).toBe('Opponent 1');
    expect(seatNameOf(2, 1, 3)).toBe('Opponent 2');
  });

  test('turnOwner and turnLabel follow', () => {
    expect(turnOwner(1, 0)).toBe("Opponent's");
    expect(turnOwner(2, 0, 3)).toBe("Opponent 2's");
    expect(turnLabel(1, 0, 2, 2)).toBe("Opponent's turn 1");
    expect(turnLabel(2, 0, 3, 3)).toBe("Opponent 2's turn 1");
    expect(turnLabel(0, 0, 4, 3)).toBe('Your turn 2');
  });
});
