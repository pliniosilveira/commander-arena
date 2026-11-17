// `pnpm precon:from-issue`. The bulk file, the decklist and the issue text are SYNTHETIC: invented names, no real card and no real precon. The issue text
// is built with `preconIssue`, the function the "Precon issues" workflow writes its issues with, so the two cannot drift apart.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePreconSnapshot } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { card, syntheticCards } from '../corpus/synthetic.ts';
import { preconIssue } from './archidekt.ts';
import { blurbFor, readPreconIssue, run } from './from-issue.ts';

const DECK =
  'Commander\n1x SYNTHETIC Flier 1\n\nMainboard\n1x SYNTHETIC Vanilla 2\n10x SYNTHETIC Forest';

const forest = card('Forest', {
  type_line: 'Basic Land — Forest',
  mana_cost: undefined as never,
  oracle_text: '{T}: Add {G}.',
  power: undefined as never,
  toughness: undefined as never,
  cmc: 0,
  colors: [],
  color_identity: ['G'],
});

function issueBody(installed?: { id: string; name: string }): string {
  return preconIssue({
    deck: { id: 1234, name: 'SYNTHETIC Deck', text: DECK, cards: 12, breakdown: '' },
    unsupported: [],
    why: [],
    notFound: [],
    ...(installed === undefined
      ? {}
      : {
          installed: {
            ...installed,
            diff: { added: [], removed: [], changed: [] },
            hash: 'abc123',
          },
        }),
  }).body;
}

async function prepare(body: string) {
  const dir = await tempDir('precon-issue-test-');
  const bulk = path.join(dir, 'bulk');
  await mkdir(bulk);
  const forms = await writeForms([...syntheticCards(), forest], bulk);
  const bodyFile = path.join(dir, 'issue.md');
  await writeFile(bodyFile, body);
  return {
    dir,
    forms,
    bodyFile,
    snapshots: path.join(dir, 'snapshots'),
    decks: path.join(dir, 'decks'),
  };
}

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) }, out, err };
};

describe('reading the issue', () => {
  test('a new precon: the id and the name of the section, the decklist above the first rule', () => {
    expect(readPreconIssue(issueBody())).toEqual({
      id: 'synthetic-deck',
      name: 'SYNTHETIC Deck',
      update: false,
      decklist: `${DECK}\n`,
    });
  });

  test('an update keeps the id and the name the app has', () => {
    expect(readPreconIssue(issueBody({ id: 'old-id', name: 'SYNTHETIC Old Name' }))).toMatchObject({
      id: 'old-id',
      name: 'SYNTHETIC Old Name',
      update: true,
    });
  });

  test('text that is not a precon issue, or names an unusable id, is refused', () => {
    expect(readPreconIssue('a deck support request')).toMatch(/no precon-issues marker/);
    const bad = issueBody().replace('id `synthetic-deck`', 'id `../x`');
    expect(readPreconIssue(bad)).toMatch(/does not give the id/);
  });

  test('the blurb names the commander the decklist names, and none without one', () => {
    expect(blurbFor(DECK, 'x')).toBe('A Commander precon led by SYNTHETIC Flier 1.');
    expect(blurbFor('Mainboard\n1x SYNTHETIC Vanilla 2', 'x')).toBeNull();
  });
});

describe('precon:from-issue', () => {
  test('writes the snapshot and the decklist from the issue', async () => {
    const t = await prepare(issueBody());
    const { io, out } = capture();
    const code = await run(
      [
        '--body',
        t.bodyFile,
        '--file',
        t.forms.jsonl,
        '--snapshots-dir',
        t.snapshots,
        '--decks-dir',
        t.decks,
      ],
      io,
    );
    expect(code).toBe(0);
    const result = JSON.parse(out.at(-1) ?? '{}');
    expect(result).toMatchObject({
      ok: true,
      id: 'synthetic-deck',
      name: 'SYNTHETIC Deck',
      update: false,
    });
    const parsed = parsePreconSnapshot(
      JSON.parse(await readFile(path.join(t.snapshots, 'synthetic-deck.json'), 'utf8')),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.snapshot.blurb).toBe('A Commander precon led by SYNTHETIC Flier 1.');
    expect(parsed.snapshot.decklist).toBe(`${DECK}\n`);
    expect(await readFile(path.join(t.decks, 'synthetic-deck.txt'), 'utf8')).toBe(`${DECK}\n`);
  });

  test('an update keeps the blurb of the precon the app has', async () => {
    const t = await prepare(issueBody({ id: 'old-id', name: 'SYNTHETIC Old Name' }));
    await mkdir(t.snapshots);
    await writeFile(
      path.join(t.snapshots, 'old-id.json'),
      JSON.stringify({ blurb: 'The blurb it has.' }),
    );
    const { io } = capture();
    const code = await run(
      [
        '--body',
        t.bodyFile,
        '--file',
        t.forms.jsonl,
        '--snapshots-dir',
        t.snapshots,
        '--decks-dir',
        t.decks,
      ],
      io,
    );
    expect(code).toBe(0);
    const written = JSON.parse(await readFile(path.join(t.snapshots, 'old-id.json'), 'utf8'));
    expect(written.blurb).toBe('The blurb it has.');
  });

  test('a card the bulk file does not have: exit 1, nothing written to the repository folders', async () => {
    const t = await prepare(issueBody().replace('SYNTHETIC Vanilla 2', 'SYNTHETIC Missing Card'));
    const { io, out } = capture();
    const code = await run(
      [
        '--body',
        t.bodyFile,
        '--file',
        t.forms.jsonl,
        '--snapshots-dir',
        t.snapshots,
        '--decks-dir',
        t.decks,
      ],
      io,
    );
    expect(code).toBe(1);
    const result = JSON.parse(out.at(-1) ?? '{}');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.problems)).toContain('SYNTHETIC Missing Card');
    await expect(readFile(path.join(t.decks, 'synthetic-deck.txt'), 'utf8')).rejects.toThrow();
  });

  test('a usage error is exit 2: no input, or both the file and the download', async () => {
    const { io } = capture();
    expect(await run([], io)).toBe(2);
    expect(await run(['--body', 'x', '--file', 'y', '--download'], io)).toBe(2);
    expect(await run(['--body', 'x'], io)).toBe(2);
  });
});
