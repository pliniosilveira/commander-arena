/**
 * Where the seats sit on the board for three or more players (docs/MORE_OPPONENTS_INVESTIGATION.md,
 * "Board plan"): the opponents share the top row in equal columns, you take 22 of 30 columns of the
 * bottom row and the flow cell (turn, stack, decision) the other 8 (a fifth narrower than the 2 of 6 it first had). A pure function of the opponent
 * count, so a new seat count adds a row to a table, not a component. One opponent is today's board
 * (`Board.tsx`), which this does not describe.
 */

export type TableCellKey = 'opp1' | 'opp2' | 'opp3' | 'me' | 'flow';

export interface TableCell {
  readonly key: TableCellKey;
  /** 1 is the top row, 2 the bottom row. */
  readonly row: 1 | 2;
  /** First column, from 1. */
  readonly col: number;
  readonly colSpan: number;
}

export interface TableAreas {
  readonly columns: 30;
  readonly cells: readonly TableCell[];
  /** The CSS `grid-template-areas` value that names each cell by its key. */
  readonly gridTemplateAreas: string;
}

const COLUMNS = 30;
const ME_SPAN = 22;

/** The areas for two or three opponents; any other count is a `RangeError` (one is `Board.tsx`). */
export function tableAreas(opponents: number): TableAreas {
  if (opponents !== 2 && opponents !== 3) {
    throw new RangeError(`tableAreas: ${opponents} opponents; the table board draws 2 or 3`);
  }
  const span = COLUMNS / opponents;
  const keys: readonly TableCellKey[] = (['opp1', 'opp2', 'opp3'] as const).slice(0, opponents);
  const cells: TableCell[] = [
    ...keys.map((key, i) => ({ key, row: 1 as const, col: 1 + i * span, colSpan: span })),
    { key: 'me', row: 2, col: 1, colSpan: ME_SPAN },
    { key: 'flow', row: 2, col: ME_SPAN + 1, colSpan: COLUMNS - ME_SPAN },
  ];
  const rowText = (row: 1 | 2): string =>
    `"${cells
      .filter((c) => c.row === row)
      .flatMap((c) => Array.from({ length: c.colSpan }, () => c.key))
      .join(' ')}"`;
  return { columns: COLUMNS, cells, gridTemplateAreas: `${rowText(1)} ${rowText(2)}` };
}
