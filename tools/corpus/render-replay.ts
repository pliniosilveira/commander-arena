// reports/template-replay.md: the estimate of replay.ts as Markdown. Deterministic: no clock,
// stable sorting (by value, then by text in code-point order).

import { cell, code, groupDigits, table } from './markdown.ts';
import {
  CLASSES,
  CONTEXTS,
  type ReplayClass,
  type ReplayResult,
  type ReplayRow,
} from './replay.ts';

/** Unread templates listed in the report. */
export const UNREAD_SHOWN = 150;
/** Rows of each grouping table. */
export const GROUPS_SHOWN = 40;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Heaviest first; ties by cards, then by template text. */
function byWeight(a: ReplayRow, b: ReplayRow): number {
  return b.weight - a.weight || b.cards - a.cards || compare(a.template, b.template);
}

function sum(rows: readonly ReplayRow[], pick: (row: ReplayRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

export interface Group {
  readonly key: string;
  readonly templates: number;
  readonly cards: number;
  readonly weight: number;
}

/** Groups rows by the keys `keysOf` gives (a row can be in several groups), heaviest first. */
export function groupRows(
  rows: readonly ReplayRow[],
  keysOf: (row: ReplayRow) => readonly string[],
): Group[] {
  const groups = new Map<string, { templates: number; cards: number; weight: number }>();
  for (const row of rows) {
    for (const key of new Set(keysOf(row))) {
      const group = groups.get(key) ?? { templates: 0, cards: 0, weight: 0 };
      group.templates += 1;
      group.cards += row.cards;
      group.weight += row.weight;
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => b.weight - a.weight || b.cards - a.cards || compare(a.key, b.key));
}

function detail(row: ReplayRow): string {
  const { outcome } = row;
  switch (outcome.kind) {
    case 'notRunnable':
      return outcome.needs.length > 0
        ? outcome.needs.map((need) => code(need)).join(', ')
        : `${code(outcome.closestRule)} (no feature named)`;
    case 'unboundReference':
      return `${code(outcome.closestRule)}, nothing for ${code(outcome.reference)} to refer to`;
    case 'unrecognised':
      return code(outcome.closestRule);
    case 'read':
      return '';
  }
}

function groupTable(label: string, groups: readonly Group[]): string[] {
  return table(
    [label, 'Templates', 'Cards', 'Weight'],
    groups
      .slice(0, GROUPS_SHOWN)
      .map((g) => [
        code(cell(g.key)),
        groupDigits(g.templates),
        groupDigits(g.cards),
        g.weight.toFixed(4),
      ]),
  );
}

export function renderReplay(result: ReplayResult): string {
  const rows = result.rows;
  const unread = rows.filter((row) => row.outcome.kind !== 'read').sort(byWeight);
  const totalWeight = sum(rows, (row) => row.weight);
  const out: string[] = [
    '# Template replay',
    '',
    `Generated from \`templates.json\` (source ${code(result.source)}, parser version ${result.parserVersion}, ${groupDigits(result.cards)} cards analysed, ${groupDigits(result.unsupportedCards)} unsupported, ${groupDigits(result.totalTemplates)} shapes in all) and replayed with the current parser version ${result.currentVersion}. Each of the ${groupDigits(rows.length)} shapes kept in the file is one real Oracle example line, run through the current grammar.`,
    '',
    '**This is an ability-level estimate, not card coverage.** A card needs every one of its abilities read, its layout and printed values accepted and `validateCard` to pass; none of that is checked here. The example is parsed as the only ability of a SYNTHETIC face, so card-level checks are excluded and a line counts as read when the grammar reads it and its lowering needs no missing engine feature. The real card type is not known, so the line is tried in a few neutral faces (' +
      `${CONTEXTS.map((c) => c.label).join(', ')}) and counts as read when any of them reads it. Weights are the EDHREC weights of the original run (the sum over the distinct cards a shape blocked), and the cards of two shapes overlap, so the sums are not card counts.`,
    '',
    'Regenerate with `pnpm corpus:replay` (offline; see docs/CORPUS.md). Run it again after the grammar or `SUPPORTED_FEATURES` changes.',
    '',
    '## Summary',
    '',
    ...table(
      ['Class', 'Templates', 'Weight', 'Cards (summed)'],
      [
        ...CLASSES.map((kind) => {
          const subset = rows.filter((row) => row.outcome.kind === kind);
          return [
            summaryName(kind),
            groupDigits(subset.length),
            subset.length === 0 ? '0.0000' : sum(subset, (row) => row.weight).toFixed(4),
            groupDigits(sum(subset, (row) => row.cards)),
          ];
        }),
        [
          '**all**',
          groupDigits(rows.length),
          totalWeight.toFixed(4),
          groupDigits(sum(rows, (row) => row.cards)),
        ],
      ],
    ),
    '',
    '`read`: the grammar reads the line and nothing it needs is missing. `notRunnable`: read, but the lowering needs engine features that `SUPPORTED_FEATURES` does not list. `unboundReference`: read, but a pronoun had nothing to refer to. `unrecognised`: no grammar rule reads the line.',
    '',
  ];

  const read = rows.filter((row) => row.outcome.kind === 'read');
  if (read.length > 0) {
    out.push(
      '### Read, by the face that read it',
      '',
      ...table(
        ['Face', 'Templates', 'Weight'],
        CONTEXTS.flatMap((context) => {
          const subset = read.filter((row) => row.outcome.context === context.label);
          return subset.length === 0
            ? []
            : [
                [
                  context.label,
                  groupDigits(subset.length),
                  sum(subset, (row) => row.weight).toFixed(4),
                ],
              ];
        }),
      ),
      '',
    );
  }

  out.push(
    `## Still unread (top ${Math.min(UNREAD_SHOWN, unread.length)} of ${groupDigits(unread.length)} by weight)`,
    '',
    ...table(
      [
        '#',
        'Template',
        'Cards',
        'Solo cards',
        'Weight',
        'Class',
        'Closest rule or missing',
        'Stopped at',
        'Example',
      ],
      unread
        .slice(0, UNREAD_SHOWN)
        .map((row, i) => [
          String(i + 1),
          code(cell(row.template)),
          groupDigits(row.cards),
          groupDigits(row.soloCards),
          row.weight.toFixed(4),
          row.outcome.kind,
          cell(detail(row)),
          row.outcome.stoppedAt === '' ? '' : code(cell(row.outcome.stoppedAt)),
          code(cell(row.example)),
        ]),
    ),
    '',
    '## Work order: the unread shapes grouped',
    '',
    'Weights and cards are summed over the templates in each group (all unread templates, not only the ones listed above).',
    '',
    '### By closest rule (unrecognised and unbound)',
    '',
    'The deepest grammar rule that was being tried when reading stopped; `none` means no rule matched the start of the line.',
    '',
    ...groupTable(
      'Closest rule',
      groupRows(
        unread.filter((row) => row.outcome.kind !== 'notRunnable'),
        (row) => [row.outcome.closestRule],
      ),
    ),
    '',
    '### By missing feature (notRunnable)',
    '',
    'A template that needs several features is counted in each of them. `(none named)` is a line the lowering refused without naming a gap.',
    '',
    ...groupTable(
      'Missing feature',
      groupRows(
        unread.filter((row) => row.outcome.kind === 'notRunnable'),
        (row) => (row.outcome.needs.length > 0 ? row.outcome.needs : ['(none named)']),
      ),
    ),
    '',
  );
  return out.join('\n');
}

function summaryName(kind: ReplayClass): string {
  return `\`${kind}\``;
}
