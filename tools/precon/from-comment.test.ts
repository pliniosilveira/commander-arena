// The snapshot comment and `pnpm precon:from-comment`. The bulk file, the decklist and the issue text are SYNTHETIC: invented names, no real card and no real
// precon. The issue is built with `preconIssue`, the function the "Precon issues" workflow writes its issues with.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { card, syntheticCards } from '../corpus/synthetic.ts';
import { preconIssue } from './archidekt.ts';
import { run as fromComment } from './from-comment.ts';
import { run as fromIssue } from './from-issue.ts';
import { COMMENT_LIMIT, decodeComment, encodeComment } from './snapshot-comment.ts';

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

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) }, out, err };
};

/** The issue, the comment the workflow would write for it, and folders to write into. */
async function made(deck = DECK) {
  const dir = await tempDir('precon-comment-test-');
  const bulk = path.join(dir, 'bulk');
  await mkdir(bulk);
  const forms = await writeForms([...syntheticCards(), forest], bulk);
  const bodyFile = path.join(dir, 'issue.md');
  await writeFile(
    bodyFile,
    preconIssue({
      deck: { id: 1234, name: 'SYNTHETIC Deck', text: deck, cards: 12, breakdown: '' },
      unsupported: [],
      why: [],
      notFound: [],
    }).body,
  );
  const commentFile = path.join(dir, 'comment.md');
  const work = path.join(dir, 'work');
  const code = await fromIssue(
    [
      '--body',
      bodyFile,
      '--file',
      forms.jsonl,
      '--snapshots-dir',
      work,
      '--decks-dir',
      work,
      '--comment-out',
      commentFile,
    ],
    capture().io,
  );
  expect(code).toBe(0);
  return { dir, bodyFile, commentFile, comment: await readFile(commentFile, 'utf8'), work };
}

describe('the snapshot comment', () => {
  test('encodes the snapshot file and decodes to the same bytes', async () => {
    const m = await made();
    const original = await readFile(path.join(m.work, 'synthetic-deck.json'), 'utf8');
    const decoded = decodeComment(m.comment, `${DECK}\n`);
    if (typeof decoded === 'string') throw new Error(decoded);
    expect(decoded.id).toBe('synthetic-deck');
    expect(decoded.text).toBe(original);
    expect(m.comment.startsWith('<!-- precon-snapshot -->')).toBe(true);
    expect(m.comment.length).toBeLessThan(COMMENT_LIMIT);
  });

  test('a changed payload, a changed hash, another id or another decklist is refused', async () => {
    const m = await made();
    const lines = m.comment.split('\n');
    const at = lines.findIndex((l) => l === '```') + 1;
    const tampered = [...lines];
    tampered[at] = `A${(lines[at] ?? '').slice(1)}`;
    expect(typeof decodeComment(tampered.join('\n'))).toBe('string');
    expect(
      decodeComment(m.comment.replace(/sha256=[0-9a-f]{64}/, `sha256=${'0'.repeat(64)}`)),
    ).toBe('the snapshot does not match its hash');
    expect(decodeComment(m.comment.replace('id=synthetic-deck', 'id=other'))).toBe(
      'the id of the snapshot is not the one of the marker',
    );
    expect(decodeComment(m.comment, 'Commander\n1x Another\n')).toBe(
      'the decklist of the snapshot is not the one of the issue',
    );
    expect(decodeComment('a comment')).toBe('the comment is not a precon snapshot comment');
  });

  test('a snapshot that would not fit in a comment is refused when it is written', () => {
    const big = JSON.stringify({
      filler: Array.from({ length: 60000 }, (_, i) => `${i}-${(i * 7919) % 104729}`),
    });
    expect(() => encodeComment('x', 'X', big)).toThrow(/a comment holds/);
  });
});

describe('precon:from-comment', () => {
  test('writes the snapshot with its set and year, and the decklist of the issue', async () => {
    const m = await made();
    const out = path.join(m.dir, 'repo-snapshots');
    const decks = path.join(m.dir, 'repo-decks');
    const { io, out: lines } = capture();
    const code = await fromComment(
      [
        ...['--comment', m.commentFile, '--body', m.bodyFile],
        ...['--set', 'SYNTHETIC Set Commander', '--year', '2026'],
        ...['--snapshots-dir', out, '--decks-dir', decks],
      ],
      io,
    );
    expect(code).toBe(0);
    expect(JSON.parse(lines.at(-1) ?? '{}')).toEqual({ ok: true, id: 'synthetic-deck' });
    const written = JSON.parse(await readFile(path.join(out, 'synthetic-deck.json'), 'utf8'));
    const generated = JSON.parse(await readFile(path.join(m.work, 'synthetic-deck.json'), 'utf8'));
    expect(written).toEqual({ ...generated, set: 'SYNTHETIC Set Commander', year: 2026 });
    expect(Object.keys(written).indexOf('set')).toBe(Object.keys(written).indexOf('decklist') + 1);
    expect(await readFile(path.join(decks, 'synthetic-deck.txt'), 'utf8')).toBe(`${DECK}\n`);
  });

  test('a new deck without its set and year is refused and nothing is written', async () => {
    const m = await made();
    const out = path.join(m.dir, 'repo-snapshots');
    const { io, err } = capture();
    const code = await fromComment(
      [
        ...[
          '--comment',
          m.commentFile,
          '--body',
          m.bodyFile,
          '--snapshots-dir',
          out,
          '--decks-dir',
          out,
        ],
      ],
      io,
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/needs its set and year/);
    await expect(readFile(path.join(out, 'synthetic-deck.json'), 'utf8')).rejects.toThrow();
  });

  test('an update keeps the set and year the snapshot already has', async () => {
    const m = await made();
    const out = path.join(m.dir, 'repo-snapshots');
    const args = ['--comment', m.commentFile, '--body', m.bodyFile, '--snapshots-dir', out];
    await fromComment(
      [...args, '--decks-dir', out, '--set', 'SYNTHETIC Set', '--year', '2025'],
      capture().io,
    );
    expect(await fromComment([...args, '--decks-dir', out], capture().io)).toBe(0);
    expect(JSON.parse(await readFile(path.join(out, 'synthetic-deck.json'), 'utf8'))).toMatchObject(
      {
        set: 'SYNTHETIC Set',
        year: 2025,
      },
    );
  });

  test('a comment for another list than the issue has is refused and nothing is written', async () => {
    const m = await made();
    const other = await made('Commander\n1x SYNTHETIC Flier 1\n\nMainboard\n11x SYNTHETIC Forest');
    const out = path.join(m.dir, 'repo-snapshots');
    const { io, err } = capture();
    const code = await fromComment(
      [
        '--comment',
        other.commentFile,
        '--body',
        m.bodyFile,
        '--set',
        'SYNTHETIC Set',
        '--year',
        '2026',
        '--snapshots-dir',
        out,
        '--decks-dir',
        out,
      ],
      io,
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/decklist of the snapshot is not the one of the issue/);
    await expect(readFile(path.join(out, 'synthetic-deck.json'), 'utf8')).rejects.toThrow();
  });

  test('a usage error is exit 2', async () => {
    expect(await fromComment([], capture().io)).toBe(2);
  });
});
