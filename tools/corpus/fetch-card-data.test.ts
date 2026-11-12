// `pnpm corpus:fetch-card-data` (D-290) with a fake Scryfall and SYNTHETIC cards only: nothing here is real card data and nothing touches the network.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { checkIssue } from './check-issue.ts';
import { type FetchDeps, fetchCardData, MAX_COMMENT_LENGTH, main } from './fetch-card-data.ts';
import { cardsOfIssue } from './from-issue.ts';

type Raw = Record<string, unknown>;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A single-faced card object with every field the app stores (SYNTHETIC). */
function raw(name: string, extra: Raw = {}): Raw {
  return {
    object: 'card',
    id: `synthetic-id-${slug(name)}`,
    oracle_id: `44444444-0000-0000-0000-${String(slug(name).length).padStart(12, '0')}`,
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

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** A fake Scryfall: `/cards/collection` knows `cards` by name, `/cards/named?fuzzy=` knows `fuzzy`; anything else is a 404. */
function fakeScryfall(
  cards: readonly Raw[],
  options: { fuzzy?: Record<string, Raw>; down?: boolean } = {},
) {
  const calls: Call[] = [];
  let clock = 0;
  const deps: FetchDeps = {
    fetch: async (url, init) => {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({
        url,
        method: init.method ?? 'GET',
        body,
        headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      });
      if (options.down === true) throw new Error('network down');
      const parsed = new URL(url);
      if (parsed.pathname === '/cards/collection') {
        const identifiers = (body as { identifiers: { name: string }[] }).identifiers;
        const data: Raw[] = [];
        const notFound: { name: string }[] = [];
        for (const { name } of identifiers) {
          const card = cards.find((c) => String(c.name).toLowerCase() === name.toLowerCase());
          if (card === undefined) notFound.push({ name });
          else data.push(card);
        }
        return json({ object: 'list', not_found: notFound, data });
      }
      const fuzzy = parsed.searchParams.get('fuzzy')?.toLowerCase();
      const hit = fuzzy === undefined ? undefined : options.fuzzy?.[fuzzy];
      return hit === undefined
        ? json({ object: 'error', status: 404, code: 'not_found' }, 404)
        : json(hit);
    },
    now: () => {
      clock += 1000;
      return clock;
    },
    sleep: async () => {},
    userAgent: 'synthetic-test-agent/1',
  };
  return { deps, calls };
}

const A = raw('SYNTHETIC Fetch Thopter');
const B = raw('SYNTHETIC Fetch Engine', { oracle_id: '44444444-0000-0000-0000-00000000beef' });
const HALF_X = raw('SYNTHETIC Fetch Half X', {
  layout: 'meld',
  oracle_id: '44444444-0000-0000-0000-0000000000a1',
  all_parts: [
    { object: 'related_card', id: 'x', component: 'meld_part', name: 'SYNTHETIC Fetch Half X' },
    { object: 'related_card', id: 'y', component: 'meld_part', name: 'SYNTHETIC Fetch Half Y' },
    { object: 'related_card', id: 'w', component: 'meld_result', name: 'SYNTHETIC Fetch Whole' },
  ],
});
const WHOLE = raw('SYNTHETIC Fetch Whole', {
  layout: 'meld',
  oracle_id: '44444444-0000-0000-0000-0000000000a3',
});

/** A description as Leandro-style reports are: the names only in the cards of a template report, no decklist, no card data. */
const description = (names: readonly string[]) =>
  [
    `Template report for "": ${names.length} unsupported card(s).`,
    '',
    'Ability templates the parser could not read (cards blocked, abilities, template, example):',
    `- ${names.length} card(s), 1 ability(ies): SYNTHETIC ability`,
    '    e.g. SYNTHETIC ability',
    `    cards: ${names.join('; ')}`,
  ].join('\n');

const DIGEST = 'a'.repeat(64);

describe('the cards come from Scryfall, not from the issue', () => {
  test('a fetched comment completes the request, and its records say where they came from', async () => {
    const { deps } = fakeScryfall([A, B]);
    const names = ['SYNTHETIC Fetch Thopter', 'SYNTHETIC Fetch Engine'];
    const result = await fetchCardData(names, DIGEST, deps);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    const comment = result.comment ?? '';
    expect(comment.startsWith(`<!-- deck-support-card-data --><!-- sha256:${DIGEST} -->\n`)).toBe(
      true,
    );
    const records = cardsOfIssue(comment, 7, true);
    expect(records.map((r) => r.name)).toEqual(names);
    expect(records.every((r) => r.acceptance === true)).toBe(true);
    expect(
      records.every((r) => r.source === 'deck-support workflow (Scryfall API), issue #7'),
    ).toBe(true);
    const check = checkIssue(description(names), { cardData: comment });
    expect(check).toMatchObject({ complete: true, problems: [], needsCardData: false });
  });

  test('only the names go to Scryfall, to api.scryfall.com, with the agent named', async () => {
    const { deps, calls } = fakeScryfall([A]);
    await fetchCardData(['SYNTHETIC Fetch Thopter', 'SYNTHETIC Fetch Lost'], null, deps);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(new URL(call.url).origin).toBe('https://api.scryfall.com');
      expect(call.headers['User-Agent']).toBe('synthetic-test-agent/1');
    }
    expect(calls[0]?.body).toEqual({
      identifiers: [{ name: 'SYNTHETIC Fetch Thopter' }, { name: 'SYNTHETIC Fetch Lost' }],
    });
  });

  test('a name Scryfall does not know is a problem, and no comment is written', async () => {
    const { deps } = fakeScryfall([A]);
    const result = await fetchCardData(
      ['SYNTHETIC Fetch Thopter', 'SYNTHETIC Fetch Lost'],
      null,
      deps,
    );
    expect(result.ok).toBe(false);
    expect(result.comment).toBeNull();
    expect(result.problems).toEqual([
      'Scryfall has no card of these names: `SYNTHETIC Fetch Lost`',
    ]);
  });

  test('a fuzzy match is never taken for the card: it is a problem naming the candidate', async () => {
    const { deps } = fakeScryfall([A], { fuzzy: { 'synthetic fetch thopte': A } });
    const result = await fetchCardData(['SYNTHETIC Fetch Thopte'], null, deps);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('only a similar card');
    expect(result.problems.join(' ')).toContain(
      '`SYNTHETIC Fetch Thopte` (`SYNTHETIC Fetch Thopter`?)',
    );
  });

  test('Scryfall that cannot be reached is a problem, not a crash', async () => {
    const { deps } = fakeScryfall([A], { down: true });
    const result = await fetchCardData(['SYNTHETIC Fetch Thopter'], null, deps);
    expect(result.ok).toBe(false);
    expect(result.comment).toBeNull();
    expect(result.problems.join(' ')).toContain('could not be asked');
  });

  test('a meld card brings its melded face as a related record, which is no card of the deck', async () => {
    const { deps } = fakeScryfall([HALF_X, WHOLE]);
    const result = await fetchCardData(['SYNTHETIC Fetch Half X'], null, deps);
    expect(result.problems).toEqual([]);
    const records = cardsOfIssue(result.comment ?? '', 7, true);
    expect(records.map((r) => [r.name, r.related === true])).toEqual([
      ['SYNTHETIC Fetch Half X', false],
      ['SYNTHETIC Fetch Whole', true],
    ]);
    expect(
      checkIssue(description(['SYNTHETIC Fetch Half X']), { cardData: result.comment ?? '' })
        .complete,
    ).toBe(true);
  });

  test('a melded face Scryfall cannot give is a problem', async () => {
    const { deps } = fakeScryfall([HALF_X]);
    const result = await fetchCardData(['SYNTHETIC Fetch Half X'], null, deps);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('melded face');
  });

  test('a comment that would not fit in GitHub is a problem, not a cut', async () => {
    // Incompressible text: a pseudo-random string, so the gzip of 40 cards stays large.
    let seed = 12345;
    const noise = (length: number) =>
      Array.from({ length }, () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return String.fromCharCode(33 + (seed % 90));
      }).join('');
    const big = Array.from({ length: 40 }, (_, i) =>
      raw(`SYNTHETIC Fetch Big ${i}`, {
        oracle_text: noise(2500),
        oracle_id: `55555555-0000-0000-0000-${String(i).padStart(12, '0')}`,
      }),
    );
    const { deps } = fakeScryfall(big);
    const result = await fetchCardData(
      big.map((c) => String(c.name)),
      null,
      deps,
    );
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('too long for a comment');
    expect(MAX_COMMENT_LENGTH).toBeLessThan(65536);
  });
});

describe('the command line', () => {
  const out = () => {
    const lines: string[] = [];
    return { lines, write: (text: string) => void lines.push(text) };
  };

  test('reads the description, writes the comment file and says how many cards', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fetch-card-data-'));
    const body = path.join(dir, 'issue.md');
    const comment = path.join(dir, 'comment.md');
    await writeFile(body, description(['SYNTHETIC Fetch Thopter', 'SYNTHETIC Fetch Engine']));
    const { deps } = fakeScryfall([A, B]);
    const o = out();
    const code = await main(['--body', body, '--out', comment, '--digest', DIGEST], o.write, deps);
    expect(code).toBe(0);
    expect(JSON.parse(o.lines[0] ?? '')).toEqual({ ok: true, count: 2, problems: [] });
    expect(await readFile(comment, 'utf8')).toContain('<!-- deck-support-card-data -->');
  });

  test('fetches nothing when the request does not need it (it has a block, or no names)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fetch-card-data-'));
    const body = path.join(dir, 'issue.md');
    const comment = path.join(dir, 'comment.md');
    await writeFile(body, 'no names here');
    const { deps, calls } = fakeScryfall([A]);
    const o = out();
    expect(await main(['--body', body, '--out', comment], o.write, deps)).toBe(1);
    expect(calls).toEqual([]);
    expect(JSON.parse(o.lines[0] ?? '').problems).toEqual([
      'the request does not need card data from Scryfall: nothing was fetched',
    ]);
  });

  test('bad usage exits 2', async () => {
    const { deps } = fakeScryfall([]);
    const o = out();
    expect(await main([], o.write, deps)).toBe(2);
    expect(await main(['--body', 'x', '--out', 'y', '--digest', 'nothex'], o.write, deps)).toBe(2);
  });
});
