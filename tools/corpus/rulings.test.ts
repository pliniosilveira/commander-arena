// `pnpm corpus:fetch-rulings` and `pnpm corpus:rulings-from-comment` (issue 284) with a fake Scryfall: the cards and the rulings here are SYNTHETIC,
// nothing is real card data or a real ruling and nothing touches the network.

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  type FetchDeps,
  fetchRulings,
  MAX_COMMENT_LENGTH,
  mainFetch,
  mainRead,
  RULINGS_COMMENT_MARKER,
  readRulingsComment,
  rulingsMarkdown,
} from './rulings.ts';

type Raw = Record<string, unknown>;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A single-faced card object with every field the app stores (SYNTHETIC). */
function raw(name: string, extra: Raw = {}): Raw {
  return {
    object: 'card',
    id: `synthetic-id-${slug(name)}`,
    oracle_id: `55555555-0000-0000-0000-${String(slug(name).length).padStart(12, '0')}`,
    name,
    layout: 'normal',
    mana_cost: '{1}{U}',
    cmc: 2,
    type_line: 'Creature — Synthetic Beast',
    oracle_text: 'Flying',
    power: '2',
    toughness: '2',
    colors: ['U'],
    color_identity: ['U'],
    keywords: ['Flying'],
    produced_mana: [],
    legalities: { commander: 'legal' },
    edhrec_rank: 100,
    game_changer: false,
    image_uris: {
      small: 'https://cards.synthetic.invalid/s.jpg',
      normal: 'https://cards.synthetic.invalid/n.jpg',
      large: 'https://cards.synthetic.invalid/l.jpg',
      png: 'https://cards.synthetic.invalid/c.png',
      art_crop: 'https://cards.synthetic.invalid/a.jpg',
      border_crop: 'https://cards.synthetic.invalid/b.jpg',
    },
    artist: 'Synthetic Artist',
    ...extra,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ruling = (text: string, date = '2026-01-02') => ({
  object: 'ruling',
  source: 'wotc',
  published_at: date,
  comment: text,
});

/** A fake Scryfall: `/cards/collection` knows `cards` by name, `/cards/<id>/rulings` answers from `rulings` by card name; `broken` names answer 500. */
function fakeScryfall(
  cards: readonly Raw[],
  rulings: Record<string, readonly unknown[]>,
  broken: readonly string[] = [],
) {
  const urls: string[] = [];
  let clock = 0;
  const deps: FetchDeps = {
    fetch: async (url, init) => {
      urls.push(url);
      const parsed = new URL(url);
      if (parsed.pathname === '/cards/collection') {
        const body = JSON.parse(String(init.body)) as { identifiers: { name: string }[] };
        const data: Raw[] = [];
        const notFound: { name: string }[] = [];
        for (const { name } of body.identifiers) {
          const card = cards.find((c) => String(c.name).toLowerCase() === name.toLowerCase());
          if (card === undefined) notFound.push({ name });
          else data.push(card);
        }
        return json({ object: 'list', not_found: notFound, data });
      }
      const match = /^\/cards\/([^/]+)\/rulings$/.exec(parsed.pathname);
      const card = match === null ? undefined : cards.find((c) => c.id === match[1]);
      if (card === undefined) return json({ object: 'error', status: 404, code: 'not_found' }, 404);
      if (broken.includes(String(card.name))) return json({ object: 'error', status: 500 }, 500);
      return json({ object: 'list', has_more: false, data: rulings[String(card.name)] ?? [] });
    },
    now: () => {
      clock += 1000;
      return clock;
    },
    sleep: async () => {},
    userAgent: 'synthetic-test-agent/1',
  };
  return { deps, urls };
}

const A = raw('SYNTHETIC Ruled Thopter');
const B = raw('SYNTHETIC Unruled Engine', { oracle_id: '55555555-0000-0000-0000-00000000beef' });
const DIGEST = 'a'.repeat(64);

describe('fetching the rulings', () => {
  test('one comment with the rulings of every card, bound to the description by its hash', async () => {
    const { deps, urls } = fakeScryfall([A, B], {
      'SYNTHETIC Ruled Thopter': [
        ruling('SYNTHETIC first ruling.'),
        ruling('SYNTHETIC second ruling.', '2026-03-04'),
      ],
    });
    const result = await fetchRulings([String(A.name), String(B.name)], DIGEST, deps);
    expect(result.problems).toEqual([]);
    expect(result).toMatchObject({ ok: true, cards: 2, rulings: 2 });
    const comment = result.comment ?? '';
    expect(comment.startsWith(`${RULINGS_COMMENT_MARKER}<!-- sha256:${DIGEST} -->`)).toBe(true);
    expect(urls.filter((u) => u.endsWith('/rulings'))).toEqual([
      'https://api.scryfall.com/cards/synthetic-id-synthetic-ruled-thopter/rulings',
      'https://api.scryfall.com/cards/synthetic-id-synthetic-unruled-engine/rulings',
    ]);
    const read = readRulingsComment(comment, DIGEST);
    if (typeof read === 'string') throw new Error(read);
    expect(read).toEqual([
      {
        name: 'SYNTHETIC Ruled Thopter',
        rulings: [
          { date: '2026-01-02', source: 'wotc', text: 'SYNTHETIC first ruling.' },
          { date: '2026-03-04', source: 'wotc', text: 'SYNTHETIC second ruling.' },
        ],
      },
      { name: 'SYNTHETIC Unruled Engine', rulings: [] },
    ]);
  });

  test('a card Scryfall does not know, or whose rulings fail, is named as not fetched; the others are kept', async () => {
    const { deps } = fakeScryfall(
      [A, B],
      { 'SYNTHETIC Ruled Thopter': [ruling('SYNTHETIC kept.')] },
      ['SYNTHETIC Unruled Engine'],
    );
    const result = await fetchRulings(
      [String(A.name), String(B.name), 'SYNTHETIC Nobody'],
      DIGEST,
      deps,
    );
    expect(result.ok).toBe(true);
    expect(result.cards).toBe(1);
    expect(result.problems.join(' ')).toContain('SYNTHETIC Unruled Engine');
    expect(result.problems.join(' ')).toContain('SYNTHETIC Nobody');
    expect(result.comment).toContain('Not fetched');
    const read = readRulingsComment(result.comment ?? '', DIGEST);
    if (typeof read === 'string') throw new Error(read);
    expect(read.map((r) => r.name)).toEqual(['SYNTHETIC Ruled Thopter']);
  });

  test('no card at all: no comment', async () => {
    const { deps } = fakeScryfall([], {});
    const result = await fetchRulings(['SYNTHETIC Nobody'], DIGEST, deps);
    expect(result).toMatchObject({ ok: false, comment: null, cards: 0 });
  });

  test('a comment that would be too long leaves cards out and says which', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      raw(`SYNTHETIC Long ${i}`, { id: `long-${i}` }),
    );
    // Text that does not compress: every ruling is different pseudo-random hex.
    const noise = (seed: number) =>
      Array.from({ length: 60 }, (_, i) =>
        createHash('sha256').update(`${seed}-${i}`).digest('hex'),
      ).join(' ');
    const rulings = Object.fromEntries(many.map((c, i) => [String(c.name), [ruling(noise(i))]]));
    const { deps } = fakeScryfall(many, rulings);
    const result = await fetchRulings(
      many.map((c) => String(c.name)),
      DIGEST,
      deps,
    );
    expect(result.ok).toBe(true);
    expect((result.comment ?? '').length).toBeLessThanOrEqual(MAX_COMMENT_LENGTH);
    expect(result.cards).toBeLessThan(40);
    expect(result.problems.join(' ')).toMatch(/left out/);
  });
});

describe('reading the comment', () => {
  const good = async () => {
    const { deps } = fakeScryfall([A], { 'SYNTHETIC Ruled Thopter': [ruling('SYNTHETIC text.')] });
    return (await fetchRulings([String(A.name)], DIGEST, deps)).comment ?? '';
  };

  test('another description (another hash), a broken payload or another comment is refused', async () => {
    const comment = await good();
    expect(readRulingsComment(comment, 'b'.repeat(64))).toMatch(
      /another version of the description/,
    );
    expect(readRulingsComment('a comment', DIGEST)).toMatch(/not a rulings comment/);
    const lines = comment.split('\n');
    const at = lines.indexOf('```') + 1;
    lines[at] = `A${(lines[at] ?? '').slice(1)}`;
    expect(typeof readRulingsComment(lines.join('\n'), DIGEST)).toBe('string');
  });

  test('the Markdown lists each card with its rulings, and says when a card has none', () => {
    const text = rulingsMarkdown([
      {
        name: 'SYNTHETIC One',
        rulings: [{ date: '2026-01-02', source: 'wotc', text: 'SYNTHETIC text.' }],
      },
      { name: 'SYNTHETIC Two', rulings: [] },
    ]);
    expect(text).toContain('## SYNTHETIC One\n\n- 2026-01-02 (wotc): SYNTHETIC text.');
    expect(text).toContain('## SYNTHETIC Two\n\nNo rulings on Scryfall.');
  });
});

describe('the command lines', () => {
  const description = (names: readonly string[]) =>
    `1x Somebody\n\n---\n\nUnsupported cards (${names.length}): ${names.join('; ')}\n`;

  test('fetch writes the comment; read checks the hash of the description and writes outside the repository', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rulings-test-'));
    const body = path.join(dir, 'issue.md');
    const text = description([String(A.name)]);
    await writeFile(body, text);
    const digest = createHash('sha256').update(text).digest('hex');
    const { deps } = fakeScryfall([A], { 'SYNTHETIC Ruled Thopter': [ruling('SYNTHETIC text.')] });
    const out: string[] = [];
    const comment = path.join(dir, 'comment.md');
    expect(
      await mainFetch(
        ['--body', body, '--out', comment, '--digest', digest],
        (t) => out.push(t),
        deps,
      ),
    ).toBe(0);
    expect(JSON.parse(out.at(-1) ?? '{}')).toMatchObject({ ok: true, cards: 1, rulings: 1 });

    const target = path.join(dir, 'rulings.md');
    expect(
      await mainRead(['--comment', comment, '--body', body, '--out', target], (t) => out.push(t)),
    ).toBe(0);
    expect(await readFile(target, 'utf8')).toContain('SYNTHETIC text.');

    // The description changed after the fetch: the comment is stale.
    await writeFile(body, `${text}\nedited`);
    expect(
      await mainRead(['--comment', comment, '--body', body, '--out', target], (t) => out.push(t)),
    ).toBe(1);
    // Rulings are Wizards' text: never written into the repository.
    await writeFile(body, text);
    expect(
      await mainRead(['--comment', comment, '--body', body, '--out', 'docs/rulings.md'], (t) =>
        out.push(t),
      ),
    ).toBe(2);
  });

  test('usage errors are exit 2', async () => {
    const { deps } = fakeScryfall([], {});
    expect(await mainFetch([], () => {}, deps)).toBe(2);
    expect(await mainRead([], () => {})).toBe(2);
  });
});
