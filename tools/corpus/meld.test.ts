// Meld in the corpus tools (D-994, CR 701.42, 712.5): the combined face of a pair is a card of its own that is not Commander-legal and that no list names, so the tools that
// read the bulk file carry it along: `corpus:extract` takes it with the pair (as a `related` record that no group counts), `coverage:cards` reads a half with the face wherever in
// the file it is, `corpus:decks` and `precon:snapshot` too, and `corpus:check-issue` calls an issue without it incomplete. SYNTHETIC cards only; the component names
// `meld_part` and `meld_result` are UNVERIFIED against the real Scryfall data.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePreconSnapshot } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { analyzeFile } from './analyze.ts';
import { indexCards, lookup, wantedKeys } from './decks.ts';
import { writeForms } from './fixture-files.ts';
import { type Io, run } from './main.ts';
import { readCardObjects } from './read-cards.ts';
import { card, type SyntheticCard } from './synthetic.ts';

const FRONT = 'SYNTHETIC Dusk';
const BACK = 'SYNTHETIC Dawn';
const RESULT = 'SYNTHETIC Twilight';

const part = (name: string, component: string) => ({ object: 'related_card', component, name });
const PARTS = [part(FRONT, 'meld_part'), part(BACK, 'meld_part'), part(RESULT, 'meld_result')];

function trio(): SyntheticCard[] {
  const front = card('Dusk', {
    layout: 'meld',
    type_line: 'Creature — Human Knight',
    mana_cost: '{2}{W}',
    colors: ['W'],
    color_identity: ['W'],
    oracle_text: `At the beginning of your end step, if you both own and control ${FRONT} and a creature named ${BACK}, exile them, then meld them into ${RESULT}.`,
  });
  const back = card('Dawn', {
    layout: 'meld',
    type_line: 'Creature — Human Cleric',
    mana_cost: '{1}{B}',
    colors: ['B'],
    color_identity: ['B'],
    oracle_text: `(Melds with ${FRONT}.)`,
  });
  const result = card('Twilight', {
    layout: 'normal',
    type_line: 'Legendary Creature — Giant',
    mana_cost: '',
    cmc: 0,
    colors: ['W', 'B'],
    color_identity: ['W', 'B'],
    oracle_text: 'Flying',
    power: '8',
    toughness: '8',
    legalities: { commander: 'not_legal' },
  });
  return [front, back, result].map((c) => ({ ...c, all_parts: PARTS })) as SyntheticCard[];
}

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

describe('coverage:cards', () => {
  test('a half is read with the melded face whether the file lists it before or after, though the face is not Commander-legal', async () => {
    for (const order of [trio(), trio().reverse()]) {
      const forms = await writeForms(order);
      const result = await analyzeFile(forms.jsonl);
      expect(result.cards.map((c) => [c.name, c.supported])).toEqual(
        expect.arrayContaining([
          [FRONT, true],
          [BACK, true],
        ]),
      );
      // The melded face is no card of the list (not legal), and is not counted as one.
      expect(result.cards.map((c) => c.name)).not.toContain(RESULT);
    }
  });

  test('a file without the melded face leaves the halves unsupported, with the reason', async () => {
    const forms = await writeForms(trio().slice(0, 2));
    const result = await analyzeFile(forms.jsonl);
    expect(result.cards.map((c) => c.supported)).toEqual([false, false]);
    expect(result.unsupported[0]?.support.reasons[0]).toMatch(/layout "meld": the melded face/);
  });
});

describe('corpus:decks', () => {
  test('a deck of a half is read with the face the file holds', async () => {
    const forms = await writeForms(trio());
    const decks = [{ name: 'd', lines: [{ name: FRONT, count: 1, section: 'main' as const }] }];
    const index = await indexCards(readCardObjects(forms.jsonl), wantedKeys(decks as never));
    expect(lookup(index, FRONT)?.support.status).toBe('supported');
    expect(index.meldFaces.size).toBe(1);
  });
});

describe('corpus:extract', () => {
  test('takes the melded face with the pair, as a related record that is no acceptance card, whatever its legality', async () => {
    const forms = await writeForms(trio());
    const names = path.join(forms.dir, 'names.txt');
    await writeFile(names, `${FRONT}\n`);
    const golden = path.join(forms.dir, 'golden.jsonl');
    const { io, err } = capture();
    const code = await run(
      ['extract', '--file', forms.jsonl, '--names', names, '--golden', golden, '--acceptance'],
      io,
      { repoRoot: forms.dir },
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const records = (await readFile(golden, 'utf8'))
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l));
    expect(records.map((r) => r.name)).toEqual([FRONT, RESULT]);
    expect(records[0]).toMatchObject({ acceptance: true });
    expect(records[0].relatedParts).toEqual([
      { name: FRONT, component: 'meld_part' },
      { name: BACK, component: 'meld_part' },
      { name: RESULT, component: 'meld_result' },
    ]);
    expect(records[1]).toMatchObject({ related: true });
    expect(records[1].acceptance).toBeUndefined();
  });

  test('the three names of the owner workflow (the two halves and the melded face) are all found: the face, not Commander-legal, was taken with the pair', async () => {
    const forms = await writeForms(trio());
    const names = path.join(forms.dir, 'names.txt');
    await writeFile(names, `${FRONT}\n${BACK}\n${RESULT}\n`);
    const golden = path.join(forms.dir, 'golden.jsonl');
    const { io, err } = capture();
    const code = await run(
      ['extract', '--file', forms.jsonl, '--names', names, '--golden', golden],
      io,
      { repoRoot: forms.dir },
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const records = (await readFile(golden, 'utf8'))
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l));
    expect(records.map((r) => r.name).sort()).toEqual([BACK, FRONT, RESULT].sort());
    expect(records.find((r) => r.name === RESULT)).toMatchObject({ related: true });
  });

  test('a melded face with the layout meld that lists only the two halves is still taken with the pair', async () => {
    const cards = trio().map((c) => (c.name === RESULT ? { ...c, layout: 'meld' } : c));
    const forms = await writeForms(cards as SyntheticCard[]);
    const names = path.join(forms.dir, 'names.txt');
    await writeFile(names, `${FRONT}\n${BACK}\n${RESULT}\n`);
    const golden = path.join(forms.dir, 'golden.jsonl');
    const { io, err } = capture();
    const code = await run(
      ['extract', '--file', forms.jsonl, '--names', names, '--golden', golden],
      io,
      { repoRoot: forms.dir },
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const records = (await readFile(golden, 'utf8'))
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l));
    expect(records.map((r) => r.name).sort()).toEqual([BACK, FRONT, RESULT].sort());
  });

  test('a melded face that is not in the file is reported', async () => {
    const forms = await writeForms(trio().slice(0, 2));
    const names = path.join(forms.dir, 'names.txt');
    await writeFile(names, `${FRONT}\n`);
    const { io, err } = capture();
    const code = await run(
      [
        'extract',
        '--file',
        forms.jsonl,
        '--names',
        names,
        '--golden',
        path.join(forms.dir, 'g.jsonl'),
      ],
      io,
      { repoRoot: forms.dir },
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/melded face of a meld card was not found/);
  });
});

describe('precon:snapshot', () => {
  test('stores the melded face with the cards of the precon', async () => {
    const forms = await writeForms([
      ...trio(),
      card('Forest', {
        type_line: 'Basic Land — Forest',
        mana_cost: undefined as never,
        oracle_text: '{T}: Add {G}.',
        power: undefined as never,
        toughness: undefined as never,
        cmc: 0,
        colors: [],
        color_identity: ['G'],
      }),
    ]);
    const deck = path.join(forms.dir, 'deck.txt');
    await writeFile(
      deck,
      `Commander\n1x ${FRONT}\n\nMainboard\n1x ${BACK}\n10x SYNTHETIC Forest\n`,
    );
    const out = path.join(forms.dir, 'snapshots');
    const { io, err } = capture();
    const code = await (await import('../precon/main.ts')).run(
      [
        '--file',
        forms.jsonl,
        '--deck',
        deck,
        '--id',
        'synthetic-meld',
        '--name',
        'SYNTHETIC',
        '--blurb',
        'A SYNTHETIC deck.',
        '--out',
        out,
      ],
      io,
      { repoRoot: forms.dir },
    );
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const parsed = parsePreconSnapshot(
      JSON.parse(await readFile(path.join(out, 'synthetic-meld.json'), 'utf8')),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const snapshot = parsed.snapshot;
    expect(snapshot.cards.map((c) => c.name).sort()).toEqual(
      [BACK, FRONT, RESULT, 'SYNTHETIC Forest'].sort(),
    );
  });
});
