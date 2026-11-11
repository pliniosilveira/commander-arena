// `pnpm precon:snapshot`. The bulk file and every decklist here are SYNTHETIC: invented names, no
// real card and no real precon.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePreconSnapshot } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { card, type SyntheticCard, syntheticCards } from '../corpus/synthetic.ts';
import { type Io, run } from './main.ts';

function bulkCards(): SyntheticCard[] {
  const cards = syntheticCards();
  cards.push(
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
  );
  cards.push(
    card('Dayside // SYNTHETIC Nightside', {
      layout: 'transform',
      type_line: undefined as never,
      card_faces: [
        {
          name: 'SYNTHETIC Dayside',
          mana_cost: '{1}{G}',
          type_line: 'Creature — Synth',
          oracle_text: 'Flying',
          power: '1',
          toughness: '1',
          colors: ['G'],
          image_uris: { normal: 'https://example.invalid/day.jpg' },
        },
        {
          name: 'SYNTHETIC Nightside',
          mana_cost: '',
          type_line: 'Creature — Synth',
          oracle_text: 'Flying',
          power: '3',
          toughness: '3',
          colors: ['G'],
          image_uris: { normal: 'https://example.invalid/night.jpg' },
        },
      ],
    }),
  );
  return cards;
}

// Written in the "1x" form with a "Mainboard" header, like the real exports; CRLF line ends.
const DECK =
  'Commander\r\n1x SYNTHETIC Flier 1\r\n\r\nMainboard\r\n1x SYNTHETIC Vanilla 2\r\n1x SYNTHETIC Dayside\r\n10x SYNTHETIC Forest\r\n1x SYNTHETIC Flier 1\r\n';

const ARGS = ['--id', 'synthetic-deck', '--name', 'SYNTHETIC Deck', '--blurb', 'A SYNTHETIC deck.'];

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

async function prepare(deck: string) {
  const dir = await tempDir('precon-test-');
  const bulk = path.join(dir, 'bulk');
  await mkdir(bulk);
  const forms = await writeForms(bulkCards(), bulk);
  const deckFile = path.join(dir, 'deck.txt');
  await writeFile(deckFile, deck);
  return { dir, forms, deckFile, out: path.join(dir, 'out') };
}

describe('precon:snapshot', () => {
  test('writes one deterministic file with the decklist verbatim and the sorted cards', async () => {
    const t = await prepare(DECK);
    const args = ['--file', t.forms.gz, '--deck', t.deckFile, '--out', t.out, ...ARGS];
    const first = capture();
    expect(await run(args, first.io, { repoRoot: t.dir })).toBe(0);
    expect(first.err).toEqual([]);
    const target = path.join(t.out, 'synthetic-deck.json');
    const text = await readFile(target, 'utf8');

    const parsed = parsePreconSnapshot(JSON.parse(text));
    if (!parsed.ok) throw new Error(parsed.error);
    const snapshot = parsed.snapshot;
    expect(snapshot).toMatchObject({
      id: 'synthetic-deck',
      name: 'SYNTHETIC Deck',
      blurb: 'A SYNTHETIC deck.',
      source: 'oracle.jsonl.gz',
      decklist: DECK,
    });
    // One card per distinct card, double-faced cards matched by their front face, sorted by name.
    expect(snapshot.cards.map((c) => c.name)).toEqual([
      'SYNTHETIC Dayside // SYNTHETIC Nightside',
      'SYNTHETIC Flier 1',
      'SYNTHETIC Forest',
      'SYNTHETIC Vanilla 2',
    ]);
    const dayside = snapshot.cards[0];
    expect(dayside?.faces.map((f) => f.imageUris?.normal)).toEqual([
      'https://example.invalid/day.jpg',
      'https://example.invalid/night.jpg',
    ]);
    // No timestamps and no whole Scryfall objects.
    expect(text).not.toContain('fetchedAt');
    expect(text).not.toContain('legalities');
    expect(text).not.toContain('"id": "0000');

    // The same run again, from another form of the same file, gives the same bytes.
    const again = capture();
    expect(
      await run(
        ['--file', t.forms.jsonl, '--deck', t.deckFile, '--out', t.out, ...ARGS],
        again.io,
        { repoRoot: t.dir },
      ),
    ).toBe(0);
    expect(await readFile(target, 'utf8')).toBe(text.replace('oracle.jsonl.gz', 'oracle.jsonl'));
  });

  test('the default folder is apps/web/src/precons/snapshots of the repository root', async () => {
    const t = await prepare(DECK);
    const { io } = capture();
    const code = await run(['--file', t.forms.gz, '--deck', t.deckFile, ...ARGS], io, {
      repoRoot: t.dir,
    });
    expect(code).toBe(0);
    expect(await readdir(path.join(t.dir, 'apps/web/src/precons/snapshots'))).toEqual([
      'synthetic-deck.json',
    ]);
  });

  test('names that are not in the bulk file are listed, exit 1, nothing written', async () => {
    const t = await prepare(`${DECK}1x SYNTHETIC Missing B\r\n1x SYNTHETIC Missing A\r\n`);
    const { io, err } = capture();
    const code = await run(
      ['--file', t.forms.gz, '--deck', t.deckFile, '--out', t.out, ...ARGS],
      io,
      { repoRoot: t.dir },
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('2 name(s) are not in oracle.jsonl.gz');
    expect(err.indexOf('  SYNTHETIC Missing A')).toBeLessThan(err.indexOf('  SYNTHETIC Missing B'));
    await expect(readdir(t.out)).rejects.toThrow();
  });

  test('unreadable decklist lines are an error too', async () => {
    const t = await prepare('Commander\n1x SYNTHETIC Flier 1\n\n???\n');
    const { io, err } = capture();
    const code = await run(
      ['--file', t.forms.gz, '--deck', t.deckFile, '--out', t.out, ...ARGS],
      io,
      { repoRoot: t.dir },
    );
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('could not be read');
    await expect(readdir(t.out)).rejects.toThrow();
  });

  test('warns about cards the engine cannot run and about a deck that is not legal', async () => {
    const t = await prepare(`${DECK}1x SYNTHETIC Glorper 1\r\n`);
    const { io, out } = capture();
    const code = await run(
      ['--file', t.forms.gz, '--deck', t.deckFile, '--out', t.out, ...ARGS],
      io,
      { repoRoot: t.dir },
    );
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('warning: cards the engine cannot fully run: SYNTHETIC Glorper 1');
    expect(text).toContain('deck-size');
  });

  test('--help prints the usage; bad arguments and unreadable files exit 2', async () => {
    const help = capture();
    expect(await run(['--help'], help.io, { repoRoot: '.' })).toBe(0);
    expect(help.out.join('\n')).toContain('Usage: pnpm precon:snapshot');

    const bad = capture();
    expect(await run(['--id', 'x'], bad.io, { repoRoot: '.' })).toBe(2);
    expect(bad.err.join('\n')).toContain('--file is required');

    const t = await prepare(DECK);
    const noDeck = capture();
    expect(
      await run(
        ['--file', t.forms.gz, '--deck', path.join(t.dir, 'nope.txt'), ...ARGS],
        noDeck.io,
        {
          repoRoot: t.dir,
        },
      ),
    ).toBe(2);
    const noBulk = capture();
    expect(
      await run(['--file', path.join(t.dir, 'nope.gz'), '--deck', t.deckFile, ...ARGS], noBulk.io, {
        repoRoot: t.dir,
      }),
    ).toBe(2);
    const empty = await prepare('Commander\n');
    const none = capture();
    expect(
      await run(['--file', empty.forms.gz, '--deck', empty.deckFile, ...ARGS], none.io, {
        repoRoot: empty.dir,
      }),
    ).toBe(2);
  });
});
