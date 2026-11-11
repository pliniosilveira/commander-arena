// `pnpm corpus:from-issue` end to end, with SYNTHETIC cards only: nothing here is real card data. The real golden file is never touched
// (every test writes to a temp dir). The issue description is built the way the web app builds it: golden records as JSON lines,
// gzip-compressed, in base64url, inside the card data block.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { cardDataBlock, cardDataText, type GoldenCard, goldenLine } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { parseOptions } from './args.ts';
import { tempDir } from './fixture-files.ts';
import { type Io, run } from './main.ts';

const card = (name: string, oracleId: string, text = 'Flying'): GoldenCard => ({
  oracleId,
  name,
  layout: 'normal',
  colorIdentity: ['U'],
  edhrecRank: 2048,
  faces: [
    {
      name,
      manaCost: '{2}{U}',
      typeLine: 'Artifact Creature — Thopter',
      oracleText: text,
      power: '1',
      toughness: '1',
      loyalty: null,
      defense: null,
      colors: ['U'],
    },
  ],
  source: 'app import (Scryfall API)',
  acceptance: true,
});

const ONE = card('SYNTHETIC Issue Thopter', '22222222-0000-0000-0000-000000000001');
const TWO = card(
  'SYNTHETIC Issue Engine',
  '22222222-0000-0000-0000-000000000002',
  'Spree\n+ {1} — Draw a card.',
);

/** The description the app writes, around a block of the given records. */
function description(records: readonly GoldenCard[]): string {
  const payload = gzipSync(cardDataText(records)).toString('base64url');
  return [
    'Commander',
    '1x SYNTHETIC Leader',
    '',
    '---',
    '',
    'Template report',
    '',
    cardDataBlock(payload, records.length),
    '',
    'Build x',
  ].join('\n');
}

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

async function fromIssueWith(body: string, golden: string | null = null, issue = '144') {
  const dir = await tempDir();
  const bodyFile = path.join(dir, 'issue.md');
  await writeFile(bodyFile, body);
  const goldenFile = path.join(dir, 'golden.jsonl');
  if (golden !== null) await writeFile(goldenFile, golden);
  const { io, out, err } = capture();
  const code = await run(
    ['from-issue', '--body', bodyFile, '--issue', issue, '--golden', goldenFile],
    io,
    {
      repoRoot: dir,
    },
  );
  const written = await readFile(goldenFile, 'utf8').catch(() => '');
  const lines = written
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as GoldenCard);
  return { code, out: out.join('\n'), err: err.join('\n'), lines };
}

describe('the command line', () => {
  test('needs --body and --issue, takes --golden, and nothing else', () => {
    expect(parseOptions(['from-issue', '--issue', '3'])).toContain('--body');
    expect(parseOptions(['from-issue', '--body', 'b.md'])).toContain('--issue');
    expect(parseOptions(['from-issue', '--body', 'b.md', '--issue', 'x'])).toContain('--issue');
    expect(
      parseOptions(['from-issue', '--body', 'b.md', '--issue', '3', '--file', 'f.gz']),
    ).toContain('does not apply to corpus:from-issue');
    expect(parseOptions(['extract', '--file', 'f', '--names', 'n', '--body', 'b'])).toContain(
      'belong to corpus:from-issue',
    );
    expect(
      parseOptions(['from-issue', '--body', 'b.md', '--issue', '3', '--golden', 'g']),
    ).toMatchObject({
      command: 'from-issue',
      body: 'b.md',
      issue: 3,
      golden: 'g',
    });
  });
});

describe('corpus:from-issue', () => {
  test('adds the cards of the block, as acceptance cards whose source names the issue', async () => {
    const r = await fromIssueWith(description([ONE, TWO]));
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 card(s) from issue #144 (2 new, 0 replaced), 2 in all.');
    expect(r.lines).toEqual([
      { ...ONE, source: 'app import (Scryfall API), issue #144', acceptance: true },
      { ...TWO, source: 'app import (Scryfall API), issue #144', acceptance: true },
    ]);
    expect(r.lines[1]?.faces[0]?.oracleText).toBe('Spree\n+ {1} — Draw a card.');
  });

  test('a card already in the golden file is replaced, the others are kept', async () => {
    const old = {
      ...ONE,
      source: 'engine-fixture',
      faces: [{ ...(ONE.faces[0] as GoldenCard['faces'][number]), oracleText: 'old' }],
    };
    const other = card('SYNTHETIC Kept', '22222222-0000-0000-0000-0000000000ff');
    const r = await fromIssueWith(description([ONE]), `${goldenLine(old)}\n${goldenLine(other)}\n`);
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 card(s) from issue #144 (0 new, 1 replaced), 2 in all.');
    expect(r.lines.map((c) => c.name)).toEqual(['SYNTHETIC Kept', 'SYNTHETIC Issue Thopter']);
    expect(r.lines[1]?.faces[0]?.oracleText).toBe('Flying');
  });

  test('a description without the block, or with a damaged one, writes nothing and says why', async () => {
    const none = await fromIssueWith('deck support\n\nno data');
    expect(none.code).toBe(2);
    expect(none.err).toContain('no "Card data for the golden corpus" block');
    expect(none.lines).toEqual([]);

    const damaged = description([ONE]).replace(/```text\n(.{10})/, '```text\nAAAAAAAAAA');
    const bad = await fromIssueWith(damaged);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/does not decompress|not JSON|not a card/);
    expect(bad.lines).toEqual([]);

    const noId = await fromIssueWith(description([{ ...ONE, oracleId: null }]));
    expect(noId.code).toBe(2);
    expect(noId.err).toContain('no oracle id');
  });
});
