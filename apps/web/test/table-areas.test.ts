import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { shownOpponents, tableAreas } from '../src/ui/board/table-areas';
import { opponentLabel } from '../src/ui/board/table-label';

/** SYNTHETIC: only the fields the label reads. */
function viewWith(seats: number, viewer = 0): GameView {
  return {
    viewer,
    seats: Array.from({ length: seats }, (_, id) => ({ id })),
  } as unknown as GameView;
}

describe('tableAreas', () => {
  const words = (key: string, n: number) => Array.from({ length: n }, () => key).join(' ');

  test('three opponents share the top row in equal thirds', () => {
    const t = tableAreas(3);
    expect(t.columns).toBe(30);
    expect(t.cells.filter((c) => c.row === 1)).toEqual([
      { key: 'opp1', row: 1, col: 1, colSpan: 10 },
      { key: 'opp2', row: 1, col: 11, colSpan: 10 },
      { key: 'opp3', row: 1, col: 21, colSpan: 10 },
    ]);
  });

  test('two opponents share the top row in equal halves', () => {
    const t = tableAreas(2);
    expect(t.cells.filter((c) => c.row === 1)).toEqual([
      { key: 'opp1', row: 1, col: 1, colSpan: 15 },
      { key: 'opp2', row: 1, col: 16, colSpan: 15 },
    ]);
  });

  test.each([2, 3])(
    'with %i opponents you take 22 of 30 columns and the flow cell 8 below',
    (n) => {
      const bottom = tableAreas(n).cells.filter((c) => c.row === 2);
      expect(bottom).toEqual([
        { key: 'me', row: 2, col: 1, colSpan: 22 },
        { key: 'flow', row: 2, col: 23, colSpan: 8 },
      ]);
    },
  );

  test('the flow cell is a fifth narrower than the third of the width it had', () => {
    const flow = tableAreas(3).cells.find((c) => c.key === 'flow');
    expect((flow?.colSpan ?? 0) / 30).toBeCloseTo((2 / 6) * 0.8, 2);
  });

  test.each([2, 3])('the cells of %i opponents tile the grid without overlap', (n) => {
    const t = tableAreas(n);
    for (const row of [1, 2]) {
      const used = t.cells
        .filter((c) => c.row === row)
        .flatMap((c) => Array.from({ length: c.colSpan }, (_, i) => c.col + i));
      expect(used).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    }
  });

  test('grid-template-areas names every cell by its key', () => {
    expect(tableAreas(3).gridTemplateAreas).toBe(
      `"${words('opp1', 10)} ${words('opp2', 10)} ${words('opp3', 10)}" "${words('me', 22)} ${words('flow', 8)}"`,
    );
    expect(tableAreas(2).gridTemplateAreas).toBe(
      `"${words('opp1', 15)} ${words('opp2', 15)}" "${words('me', 22)} ${words('flow', 8)}"`,
    );
  });

  test('the last opponent left takes the whole top row', () => {
    const t = tableAreas(1);
    expect(t.cells.filter((c) => c.row === 1)).toEqual([
      { key: 'opp1', row: 1, col: 1, colSpan: 30 },
    ]);
    expect(t.cells.filter((c) => c.row === 2)).toEqual([
      { key: 'me', row: 2, col: 1, colSpan: 22 },
      { key: 'flow', row: 2, col: 23, colSpan: 8 },
    ]);
  });

  test('no opponents and more than three are not drawn', () => {
    expect(() => tableAreas(0)).toThrow(RangeError);
    expect(() => tableAreas(4)).toThrow(RangeError);
  });
});

describe('shownOpponents', () => {
  const seat = (id: number, hasLost: boolean) => ({ id, hasLost });

  test('an opponent who lost is left out, and the others keep their order', () => {
    const seats = [seat(1, false), seat(2, true), seat(3, false)];
    expect(shownOpponents(seats).map((s) => s.id)).toEqual([1, 3]);
  });

  test('everyone is shown while nobody has lost', () => {
    const seats = [seat(1, false), seat(2, false)];
    expect(shownOpponents(seats)).toEqual(seats);
  });

  test('when every opponent has lost (the game is over) all are shown, not an empty board', () => {
    const seats = [seat(1, true), seat(2, true)];
    expect(shownOpponents(seats)).toEqual(seats);
  });
});

describe('opponentLabel', () => {
  test('you are "You"', () => {
    expect(opponentLabel(viewWith(4), 0)).toBe('You');
  });

  test('opponents are numbered in seat order', () => {
    const view = viewWith(4);
    expect([1, 2, 3].map((s) => opponentLabel(view, s))).toEqual([
      'Opponent 1',
      'Opponent 2',
      'Opponent 3',
    ]);
  });

  test('a lone opponent keeps the plain 1v1 word', () => {
    expect(opponentLabel(viewWith(2), 1)).toBe('Opponent');
  });

  test('the numbering skips the viewer wherever they sit', () => {
    const view = viewWith(3, 1);
    expect(opponentLabel(view, 0)).toBe('Opponent 1');
    expect(opponentLabel(view, 2)).toBe('Opponent 2');
    expect(opponentLabel(view, 1)).toBe('You');
  });
});
