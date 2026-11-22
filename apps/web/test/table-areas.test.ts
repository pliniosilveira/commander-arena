import type { GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { tableAreas } from '../src/ui/board/table-areas';
import { opponentLabel } from '../src/ui/board/table-label';

/** SYNTHETIC: only the fields the label reads. */
function viewWith(seats: number, viewer = 0): GameView {
  return {
    viewer,
    seats: Array.from({ length: seats }, (_, id) => ({ id })),
  } as unknown as GameView;
}

describe('tableAreas', () => {
  test('three opponents share the top row in equal thirds', () => {
    const t = tableAreas(3);
    expect(t.columns).toBe(6);
    expect(t.cells.filter((c) => c.row === 1)).toEqual([
      { key: 'opp1', row: 1, col: 1, colSpan: 2 },
      { key: 'opp2', row: 1, col: 3, colSpan: 2 },
      { key: 'opp3', row: 1, col: 5, colSpan: 2 },
    ]);
  });

  test('two opponents share the top row in equal halves', () => {
    const t = tableAreas(2);
    expect(t.cells.filter((c) => c.row === 1)).toEqual([
      { key: 'opp1', row: 1, col: 1, colSpan: 3 },
      { key: 'opp2', row: 1, col: 4, colSpan: 3 },
    ]);
  });

  test.each([2, 3])('with %i opponents you take 4 columns and the flow cell 2 below', (n) => {
    const bottom = tableAreas(n).cells.filter((c) => c.row === 2);
    expect(bottom).toEqual([
      { key: 'me', row: 2, col: 1, colSpan: 4 },
      { key: 'flow', row: 2, col: 5, colSpan: 2 },
    ]);
  });

  test.each([2, 3])('the cells of %i opponents tile the grid without overlap', (n) => {
    const t = tableAreas(n);
    for (const row of [1, 2]) {
      const used = t.cells
        .filter((c) => c.row === row)
        .flatMap((c) => Array.from({ length: c.colSpan }, (_, i) => c.col + i));
      expect(used).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  test('grid-template-areas names every cell by its key', () => {
    expect(tableAreas(3).gridTemplateAreas).toBe(
      '"opp1 opp1 opp2 opp2 opp3 opp3" "me me me me flow flow"',
    );
    expect(tableAreas(2).gridTemplateAreas).toBe(
      '"opp1 opp1 opp1 opp2 opp2 opp2" "me me me me flow flow"',
    );
  });

  test('one opponent is today board and more than three is not built', () => {
    expect(() => tableAreas(1)).toThrow(RangeError);
    expect(() => tableAreas(4)).toThrow(RangeError);
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
