// `pnpm corpus:replay`: classification, rendering and the command line. The templates file is
// SYNTHETIC: its shapes, counts and weights are invented (the example lines are generic Oracle-style
// text, or made-up words that no grammar rule can ever read). Nothing here is real corpus data.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseOptions } from './args.ts';
import { tempDir } from './fixture-files.ts';
import { type Io, run } from './main.ts';
import { groupRows, renderReplay, UNREAD_SHOWN } from './render-replay.ts';
import {
  classifyExample,
  parseTemplatesFile,
  type ReplayResult,
  type ReplayRow,
  replayTemplates,
  type TemplatesFile,
} from './replay.ts';

// Read only with an Equipment face (CR 301.5a), so it also proves that the faces are tried.
const READ_LINE = 'Equipped creature has deathtouch and lifelink.';
// Read by the grammar; the engine's `addMana` effect has no choice of color while a triggered ability
// resolves (`selector:colorChoice`; a mana ability chooses while paying instead). This line used to
// be a granted ability in quotes (`static:grantAbility`) until the engine ran it (D-099).
const NOT_RUNNABLE_LINE = 'Whenever a land you control enters, add one mana of any color.';
// Invented words: no rule reads them, however far the grammar grows.
const UNREAD_LINE = '~ glorp the frobnicate of each gizmo.';

const SYNTHETIC_FILE: TemplatesFile = {
  source: 'SYNTHETIC-bulk.jsonl.gz',
  parserVersion: 4,
  cards: 100,
  unsupportedCards: 60,
  totalTemplates: 50,
  templates: [
    { template: 'A', example: READ_LINE, cards: 10, soloCards: 2, weight: 0.5 },
    { template: 'B', example: NOT_RUNNABLE_LINE, cards: 3, soloCards: 0, weight: 0.25 },
    { template: 'C', example: UNREAD_LINE, cards: 7, soloCards: 1, weight: 0.125 },
    { template: 'D', example: `${UNREAD_LINE} Again.`, cards: 7, soloCards: 0, weight: 0.125 },
  ],
};

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('classifyExample', () => {
  test('a line the grammar reads and the engine can run is read', () => {
    const outcome = classifyExample(READ_LINE);
    expect(outcome.kind).toBe('read');
    expect(outcome.context).toBe('equipment');
    expect(outcome.needs).toEqual([]);
  });

  test('a cost of the face (an additional cost, a free cast) is read though it makes no ability', () => {
    // SYNTHETIC wording in the shape of the real lines of templates.json.
    expect(classifyExample('As an additional cost to cast ~, sacrifice a creature.').kind).toBe(
      'read',
    );
    expect(
      classifyExample('If you control a commander, you may cast ~ without paying its mana cost.')
        .kind,
    ).toBe('read');
  });

  test('a line read but needing missing engine features is notRunnable, with the features', () => {
    const outcome = classifyExample(NOT_RUNNABLE_LINE);
    expect(outcome.kind).toBe('notRunnable');
    expect(outcome.needs).toEqual(['selector:colorChoice']);
    expect(outcome.closestRule).not.toBe('');
  });

  test('a line no rule reads is unrecognised, with the rule it stopped in and where', () => {
    const outcome = classifyExample(UNREAD_LINE);
    expect(outcome.kind).toBe('unrecognised');
    expect(outcome.closestRule).not.toBe('');
    expect(UNREAD_LINE.endsWith(outcome.stoppedAt)).toBe(true);
    expect(outcome.stoppedAt).toContain('frobnicate');
    expect(outcome.needs).toEqual([]);
  });

  test('the result does not depend on the order the lines are replayed in', () => {
    const forward = replayTemplates(SYNTHETIC_FILE).rows.map((row) => row.outcome);
    const backward = replayTemplates({
      ...SYNTHETIC_FILE,
      templates: [...SYNTHETIC_FILE.templates].reverse(),
    }).rows.map((row) => row.outcome);
    expect([...backward].reverse()).toEqual(forward);
  });
});

describe('parseTemplatesFile', () => {
  test('accepts what corpus:templates writes and refuses anything else', () => {
    expect(parseTemplatesFile(JSON.stringify(SYNTHETIC_FILE))).toEqual(SYNTHETIC_FILE);
    expect(parseTemplatesFile('{')).toContain('not valid JSON');
    expect(parseTemplatesFile('[]')).toContain('templates');
    expect(parseTemplatesFile(JSON.stringify({ templates: [] }))).toContain('header');
    expect(
      parseTemplatesFile(JSON.stringify({ ...SYNTHETIC_FILE, templates: [{ template: 'x' }] })),
    ).toContain('templates[0]');
  });
});

describe('renderReplay', () => {
  const result = replayTemplates(SYNTHETIC_FILE);

  test('states what it is generated from and that it is an estimate', () => {
    const text = renderReplay(result);
    expect(text).toContain('SYNTHETIC-bulk.jsonl.gz');
    expect(text).toContain('parser version 4');
    expect(text).toContain(`current parser version ${result.currentVersion}`);
    expect(text).toContain('ability-level estimate, not card coverage');
    expect(text).toContain('pnpm corpus:replay');
  });

  test('summarises each class with templates, weight and cards', () => {
    const text = renderReplay(result);
    expect(text).toContain('| `read` | 1 | 0.5000 | 10 |');
    expect(text).toContain('| `unrecognised` | 2 | 0.2500 | 14 |');
    expect(text).toContain('| **all** | 4 | 1.0000 | 27 |');
  });

  test('lists the unread templates by weight with their blockers, and groups them', () => {
    const text = renderReplay(result);
    const unread = text.slice(text.indexOf('## Still unread'));
    expect(unread).not.toContain(`| \`A\` |`);
    expect(unread.indexOf('`B`')).toBeLessThan(unread.indexOf('`C`'));
    // Equal weight and cards: ordered by template text.
    expect(unread.indexOf('`C`')).toBeLessThan(unread.indexOf('`D`'));
    expect(unread).toContain('`selector:colorChoice`');
    expect(unread).toContain('### By closest rule (unrecognised and unbound)');
    const rule = classifyExample(UNREAD_LINE).closestRule;
    expect(unread).toContain(`| \`${rule}\` | 2 | 14 | 0.2500 |`);
    expect(unread).toContain('### By missing feature (notRunnable)');
    expect(unread).toContain('| `selector:colorChoice` | 1 | 3 | 0.2500 |');
  });

  test('is deterministic and caps the unread list', () => {
    expect(renderReplay(replayTemplates(SYNTHETIC_FILE))).toBe(renderReplay(result));
    const row: ReplayRow = {
      template: 'T',
      example: UNREAD_LINE,
      cards: 1,
      soloCards: 0,
      weight: 0.01,
      outcome: classifyExample(UNREAD_LINE),
    };
    const many: ReplayResult = {
      ...result,
      rows: Array.from({ length: UNREAD_SHOWN + 20 }, (_, i) => ({ ...row, template: `T${i}` })),
    };
    const text = renderReplay(many);
    expect(text).toContain(`top ${UNREAD_SHOWN} of ${UNREAD_SHOWN + 20}`);
    expect(
      text.split('\n').filter((line) => line.startsWith('| ') && line.includes('`T')).length,
    ).toBe(UNREAD_SHOWN);
  });

  test('groupRows counts a row once per distinct key and orders by weight', () => {
    const [a, b] = result.rows.filter((r) => r.outcome.kind !== 'read');
    expect(a && b).toBeTruthy();
    const groups = groupRows(result.rows, (row) => ['x', 'x', row.template === 'B' ? 'y' : 'x']);
    expect(groups.map((g) => g.key)).toEqual(['x', 'y']);
    expect(groups[0]).toMatchObject({ templates: 4, cards: 27 });
    expect(groups[1]).toMatchObject({ templates: 1, cards: 3 });
  });
});

describe('the command line', () => {
  test('replay needs no input file flag and refuses flags of the other commands', () => {
    expect(parseOptions(['replay'])).toMatchObject({ command: 'replay', file: undefined });
    expect(parseOptions(['replay', '--file', 'a.json', '--out', 'b.md'])).toMatchObject({
      command: 'replay',
      file: 'a.json',
      out: 'b.md',
    });
    expect(parseOptions(['replay', '--download'])).toContain('does not apply');
    expect(parseOptions(['replay', '--check'])).toContain('does not apply');
    expect(parseOptions(['replay', '--names', 'n.txt'])).toContain('does not apply');
    expect(parseOptions(['templates'])).toContain('--file');
  });

  test('writes the report to --out and prints the class counts', async () => {
    const dir = await tempDir();
    const input = path.join(dir, 'templates.json');
    const target = path.join(dir, 'nested', 'replay.md');
    await writeFile(input, JSON.stringify(SYNTHETIC_FILE));
    const { io, out, err } = capture();
    const code = await run(['replay', '--file', input, '--out', target], io, { repoRoot: dir });
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(await readFile(target, 'utf8')).toBe(renderReplay(replayTemplates(SYNTHETIC_FILE)));
    expect(out.join('\n')).toMatch(/Replayed 4 templates .*1 read, 1 notRunnable, 2 unrecognised/);
  });

  test('reads reports/templates.json under the repository root by default', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'x'), '');
    const { io, err } = capture();
    expect(await run(['replay'], io, { repoRoot: dir })).toBe(2);
    expect(err.join('\n')).toContain('cannot read');
  });

  test('a file that is not a templates file is a bad input', async () => {
    const dir = await tempDir();
    const input = path.join(dir, 'bad.json');
    await writeFile(input, '{"templates": 3}');
    const { io, err } = capture();
    expect(await run(['replay', '--file', input], io, { repoRoot: dir })).toBe(2);
    expect(err.join('\n')).toContain('not a templates file');
  });
});
