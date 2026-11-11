// `pnpm corpus:extract` end to end, with SYNTHETIC input only: the names are invented and nothing
// here is real card data. The real golden file is never touched (every test writes to a temp dir).

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseOptions } from './args.ts';
import { parseNames } from './extract.ts';
import { tempDir, writeForms } from './fixture-files.ts';
import { type Io, run } from './main.ts';
import { card, syntheticCards } from './synthetic.ts';

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

async function extractWith(args: string[]) {
  const dir = await tempDir();
  const { io, out, err } = capture();
  const code = await run(args, io, { repoRoot: dir });
  return { code, out: out.join('\n'), err: err.join('\n'), dir };
}

async function setup(names: string, cards: readonly object[] = syntheticCards()) {
  const forms = await writeForms(cards);
  const namesFile = path.join(forms.dir, 'names.txt');
  await writeFile(namesFile, names);
  const golden = path.join(forms.dir, 'golden.jsonl');
  return { forms, namesFile, golden };
}

const lines = async (file: string) =>
  (await readFile(file, 'utf8'))
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l));

describe('the names file', () => {
  test('one name per line; blank lines, comments and duplicates are dropped', () => {
    expect(parseNames('SYNTHETIC A\n\n# a comment\nSYNTHETIC B # trailing\nSYNTHETIC A\n')).toEqual(
      ['SYNTHETIC A', 'SYNTHETIC B'],
    );
  });
});

describe('the command line', () => {
  test('needs --file and --names, and never downloads', () => {
    expect(parseOptions(['extract', '--names', 'n.txt'])).toContain('--file');
    expect(parseOptions(['extract', '--file', 'f.gz'])).toContain('--names');
    expect(parseOptions(['extract', '--download', '--names', 'n.txt'])).toContain('--file');
    expect(parseOptions(['extract', '--file', 'f.gz', '--names', 'n.txt'])).toMatchObject({
      command: 'extract',
      acceptance: false,
    });
  });

  test('the extract options are refused on the report commands', () => {
    expect(parseOptions(['coverage', '--file', 'f.gz', '--names', 'n.txt'])).toContain(
      'belong to corpus:extract',
    );
    expect(parseOptions(['templates', '--file', 'f.gz', '--acceptance'])).toContain(
      'belong to corpus:extract',
    );
  });
});

describe('pnpm corpus:extract', () => {
  test('copies the named cards, with the text and the source, into the golden file', async () => {
    const { forms, namesFile, golden } = await setup('SYNTHETIC Flier 1\nSYNTHETIC Mana Rock\n');
    const r = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 card(s) from the bulk file (2 new, 0 replaced), 2 in all.');
    const written = await lines(golden);
    expect(written.map((c) => c.name)).toEqual(['SYNTHETIC Flier 1', 'SYNTHETIC Mana Rock']);
    expect(written[0]).toMatchObject({
      name: 'SYNTHETIC Flier 1',
      layout: 'normal',
      source: 'scryfall-bulk oracle.jsonl.gz',
      colorIdentity: ['G'],
      faces: [{ typeLine: 'Creature — Synth', oracleText: 'Flying', power: '2', toughness: '2' }],
    });
    expect(written[0].oracleId).toMatch(/^11111111-/);
    expect(written[0].acceptance).toBeUndefined();
  });

  test('a name matches case-insensitively and with curly quotes, on a face name too', async () => {
    const cards = [
      card('Wolf’s Den', {}),
      card('Two Faced', {
        layout: 'transform',
        type_line: undefined as never,
        card_faces: [
          {
            name: 'SYNTHETIC Front',
            mana_cost: '',
            type_line: 'Creature — Synth',
            oracle_text: 'Flying',
          },
          { name: 'SYNTHETIC Back', mana_cost: '', type_line: 'Creature — Synth', oracle_text: '' },
        ],
      }),
    ];
    const { forms, namesFile, golden } = await setup(
      "synthetic wolf's den\nSYNTHETIC BACK\n",
      cards,
    );
    const r = await extractWith([
      'extract',
      '--file',
      forms.jsonl,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(r.code).toBe(0);
    expect((await lines(golden)).map((c) => c.name)).toEqual([
      'SYNTHETIC Wolf’s Den',
      'SYNTHETIC Two Faced',
    ]);
  });

  test('--acceptance marks the cards as outside the hold-out split', async () => {
    const { forms, namesFile, golden } = await setup('SYNTHETIC Vanilla 1\n');
    await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
      '--acceptance',
    ]);
    expect((await lines(golden))[0].acceptance).toBe(true);
  });

  test('a card already in the golden file is replaced by the fresh data, others are kept', async () => {
    const { forms, namesFile, golden } = await setup('SYNTHETIC Flier 1\n');
    const stale = {
      oracleId: null,
      name: 'Hand-written fixture',
      layout: 'normal',
      colorIdentity: [],
      edhrecRank: null,
      faces: [],
      source: 'engine-fixture',
    };
    await writeFile(golden, `${JSON.stringify(stale)}\n`);
    await extractWith(['extract', '--file', forms.gz, '--names', namesFile, '--golden', golden]);
    // Second run: the same card again is replaced in place, not duplicated.
    const again = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(again.out).toContain('(0 new, 1 replaced), 2 in all.');
    expect((await lines(golden)).map((c) => c.name)).toEqual([
      'Hand-written fixture',
      'SYNTHETIC Flier 1',
    ]);
  });

  test('a print that is not Commander-legal (an art-series card) is skipped for the real card', async () => {
    const artSeries = card('Spring', {
      layout: 'art_series',
      type_line: 'Card',
      oracle_text: '',
      legalities: { commander: 'not_legal' },
    });
    const real = card('Spring', { type_line: 'Land', oracle_text: 'Flying' });
    const { forms, namesFile, golden } = await setup('SYNTHETIC Spring\n', [artSeries, real]);
    const r = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(r.code).toBe(0);
    const written = await lines(golden);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ oracleId: real.oracle_id, layout: 'normal' });
  });

  test('an entry without an oracle id is replaced by the fresh card of the same name', async () => {
    const { forms, namesFile, golden } = await setup('SYNTHETIC Flier 1\n');
    const handWritten = {
      oracleId: null,
      name: 'SYNTHETIC Flier 1',
      layout: 'normal',
      colorIdentity: [],
      edhrecRank: null,
      faces: [],
      source: 'engine-fixture',
    };
    await writeFile(golden, `${JSON.stringify(handWritten)}\n`);
    const r = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(r.out).toContain('(0 new, 1 replaced), 1 in all.');
    const written = await lines(golden);
    expect(written).toHaveLength(1);
    expect(written[0].oracleId).toMatch(/^11111111-/);
  });

  test('names that are not in the bulk file are reported, the rest is still written', async () => {
    const { forms, namesFile, golden } = await setup('SYNTHETIC Flier 1\nSYNTHETIC Nope\n');
    const r = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('not found in the bulk file (1): SYNTHETIC Nope');
    expect((await lines(golden)).map((c) => c.name)).toEqual(['SYNTHETIC Flier 1']);
  });

  test('bad input is exit code 2 and writes nothing', async () => {
    const { forms, namesFile, golden } = await setup('');
    const empty = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(empty.code).toBe(2);
    expect(empty.err).toContain('lists no card');
    const missing = await extractWith([
      'extract',
      '--file',
      forms.gz,
      '--names',
      '/nonexistent/names.txt',
      '--golden',
      golden,
    ]);
    expect(missing.code).toBe(2);
    const noFile = await extractWith([
      'extract',
      '--file',
      '/nonexistent/oracle.gz',
      '--names',
      namesFile,
      '--golden',
      golden,
    ]);
    expect(noFile.code).toBe(2);
  });
});
