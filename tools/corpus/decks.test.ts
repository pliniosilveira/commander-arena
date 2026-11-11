// `pnpm corpus:decks`: per-deck coverage. The bulk file (synthetic.ts) and every decklist here are
// SYNTHETIC: invented names, invented ability words, no real card or precon.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseOptions } from './args.ts';
import { analyzeDeck, indexCards, readDeck, wantedKeys } from './decks.ts';
import { tempDir, writeForms } from './fixture-files.ts';
import { type Io, run } from './main.ts';
import { readCardObjects } from './read-cards.ts';
import { card, type SyntheticCard, syntheticCards } from './synthetic.ts';

// Extra SYNTHETIC cards: a basic land and a double-faced card with plain faces.
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
        },
        {
          name: 'SYNTHETIC Nightside',
          mana_cost: '',
          type_line: 'Creature — Synth',
          oracle_text: 'Flying',
          power: '3',
          toughness: '3',
          colors: ['G'],
        },
      ],
    }),
  );
  return cards;
}

const ALPHA = `Commander
1 SYNTHETIC Flier 1

Deck
4 SYNTHETIC Vanilla 1
1 SYNTHETIC Vanilla 2
10 SYNTHETIC Forest
1 SYNTHETIC Mana Rock
`;
// One blocker: Wibbler 1 (shape B alone). Glorper 1 is blocked by shape A alone.
const BETA = `Commander
1 SYNTHETIC Wibbler 1

Deck
1 SYNTHETIC Glorper 1
2 SYNTHETIC Vanilla 3
`;
// Shares shape A with BETA; Star Glorper has another reason too, so it is not a solo card.
const GAMMA = `1 SYNTHETIC Glorper 2
1 SYNTHETIC Star Glorper
1 SYNTHETIC Vanilla 4
1 SYNTHETIC Does Not Exist
`;

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

async function setup(decks: Record<string, string>) {
  const dir = await tempDir();
  const forms = await writeForms(bulkCards(), dir);
  const files: string[] = [];
  for (const [name, text] of Object.entries(decks)) {
    const file = path.join(dir, `${name}.txt`);
    await writeFile(file, text);
    files.push(file);
  }
  return { dir, forms, files };
}

async function analyze(decks: Record<string, string>) {
  const { forms } = await setup({});
  const parsed = Object.entries(decks).map(([name, text]) => readDeck(name, text));
  const index = await indexCards(readCardObjects(forms.gz), wantedKeys(parsed));
  return { index, reports: parsed.map((deck) => analyzeDeck(deck, index)) };
}

describe('analyzeDeck', () => {
  test('a fully supported deck: quantities, basic lands and the commander count', async () => {
    const { reports } = await analyze({ alpha: ALPHA });
    const [alpha] = reports;
    expect(alpha).toMatchObject({
      name: 'alpha',
      cards: 17,
      unique: 5,
      supportedCards: 17,
      supportedUnique: 5,
      fullySupported: true,
      commanders: ['SYNTHETIC Flier 1'],
      blocked: [],
      unresolved: [],
    });
  });

  test('one blocker keeps a deck from being fully supported', async () => {
    const { reports } = await analyze({ beta: BETA });
    const [beta] = reports;
    expect(beta?.fullySupported).toBe(false);
    expect(beta?.cards).toBe(4);
    expect(beta?.supportedCards).toBe(2);
    expect(beta?.supportedUnique).toBe(1);
    expect(beta?.blocked.map((c) => [c.name, c.commander, c.solo])).toEqual([
      ['SYNTHETIC Glorper 1', false, true],
      ['SYNTHETIC Wibbler 1', true, true],
    ]);
    const wibbler = beta?.blocked[1]?.blockers[0];
    expect(wibbler?.kind).toBe('shape');
    expect(wibbler?.text).toBe('SYNTHETIC wibble: zork each plinth.');
    expect(wibbler?.needs[0]).toContain('no rule reads it; closest rule');
  });

  test('a card with two blockers is not solo; a reason is a blocker too', async () => {
    const { reports } = await analyze({ gamma: GAMMA });
    const star = reports[0]?.blocked.find((c) => c.name === 'SYNTHETIC Star Glorper');
    expect(star?.solo).toBe(false);
    expect(star?.blockers.filter((b) => b.kind === 'shape')).toHaveLength(1);
    expect(star?.blockers.filter((b) => b.kind === 'reason').length).toBeGreaterThan(0);
  });

  test('a name that does not resolve is UNRESOLVED, counts as not supported and is never guessed', async () => {
    const { reports } = await analyze({ gamma: GAMMA });
    expect(reports[0]?.unresolved).toEqual([{ name: 'SYNTHETIC Does Not Exist', count: 1 }]);
    expect(reports[0]?.cards).toBe(4);
    expect(reports[0]?.supportedCards).toBe(1);
    // Even when every resolved card is supported, an unresolved name stops FULLY SUPPORTED.
    const { reports: ok } = await analyze({ d: '1 SYNTHETIC Vanilla 1\n1 SYNTHETIC Missing\n' });
    expect(ok[0]?.fullySupported).toBe(false);
  });

  test('a double-faced card is found by its front-face name, and by the full name', async () => {
    const { reports } = await analyze({
      front: '1 SYNTHETIC Dayside\n',
      full: '1 SYNTHETIC Dayside // SYNTHETIC Nightside\n',
      slash: '1 synthetic dayside / synthetic nightside\n',
    });
    for (const report of reports) {
      expect(report.unresolved).toEqual([]);
      expect(report.unique).toBe(1);
      expect(
        report.blocked.map((c) => c.name).concat(report.supportedUnique === 1 ? ['ok'] : []),
      ).toBeTruthy();
    }
    // Resolved to the full name of the card, whichever spelling the list used.
    const names = new Set(reports.map((r) => r.blocked[0]?.name ?? 'supported'));
    expect(names.size).toBe(1);
  });

  test('lines of the same card merge, and sideboard lines are not counted', async () => {
    const { reports } = await analyze({
      d: '2 SYNTHETIC Vanilla 1\n1 synthetic vanilla 1\n\nSideboard\n3 SYNTHETIC Vanilla 2\n',
    });
    expect(reports[0]).toMatchObject({ cards: 3, unique: 1, ignored: 3, fullySupported: true });
  });

  test('an empty decklist is not fully supported', async () => {
    const { reports } = await analyze({ empty: '' });
    expect(reports[0]).toMatchObject({ cards: 0, fullySupported: false });
  });

  test('the three decklist formats give the same deck', async () => {
    const arena = 'Deck\n2 SYNTHETIC Vanilla 1 (SYN) 12\n1 SYNTHETIC Flier 1 (SYN) 3\n';
    const mtgo = '2 SYNTHETIC Vanilla 1\n1 SYNTHETIC Flier 1\n';
    const moxfield = '2 SYNTHETIC Vanilla 1 (SYN) 12 *F*\n1 SYNTHETIC Flier 1 (SYN) 3\n';
    const archidekt = '2x SYNTHETIC Vanilla 1 (syn) 12 [Ramp]\n1x SYNTHETIC Flier 1 (syn) 3\n';
    const { reports } = await analyze({ arena, mtgo, moxfield, archidekt });
    for (const report of reports) {
      expect(report).toMatchObject({ cards: 3, unique: 2, fullySupported: true, errors: [] });
    }
  });
});

describe('pnpm corpus:decks', () => {
  async function invoke(
    args: string[],
    decks: Record<string, string> = { alpha: ALPHA, beta: BETA, gamma: GAMMA },
  ) {
    const { dir, forms, files } = await setup(decks);
    const outFile = path.join(dir, 'decks.md');
    const { io, out, err } = capture();
    const argv = ['decks', '--file', forms.gz, '--out', outFile];
    for (const file of files) argv.push('--deck', file);
    const code = await run([...argv, ...args], io, { repoRoot: dir });
    return { code, out: out.join('\n'), err: err.join('\n'), outFile, dir, forms, files };
  }

  test('writes the report and a summary per deck, sorted by name', async () => {
    const result = await invoke([]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'alpha: 17/17 cards supported (100.00%), 5/5 unique; FULLY SUPPORTED',
    );
    expect(result.out).toContain(
      'beta: 2/4 cards supported (50.00%), 1/3 unique; not fully supported',
    );
    expect(result.out).toContain('1 UNRESOLVED');
    const report = await readFile(result.outFile, 'utf8');
    expect(report.indexOf('## Deck: alpha')).toBeLessThan(report.indexOf('## Deck: beta'));
    expect(report.indexOf('## Deck: beta')).toBeLessThan(report.indexOf('## Deck: gamma'));
    expect(report).toContain('Generated from oracle.jsonl.gz, parser version');
    expect(report).toContain('- Commander: SYNTHETIC Wibbler 1');
    expect(report).toContain('### UNRESOLVED');
    expect(report).toContain('- SYNTHETIC Does Not Exist');
    expect(report).toContain('**FULLY SUPPORTED**');
  });

  test('the shared blocker is ranked first and counted as shared between decks', async () => {
    const result = await invoke([]);
    const report = await readFile(result.outFile, 'utf8');
    const table = report.slice(
      report.indexOf('## Blockers across the decks'),
      report.indexOf('## Deck: alpha'),
    );
    const rows = table.split('\n').filter((line) => /^\| \d+ \|/.test(line));
    // Shape A: Glorper 1 (beta), Glorper 2 and Star Glorper (gamma): 3 cards, 2 decks, 2 solo.
    expect(rows[0]).toContain('SYNTHETIC glorp N, frobnicate target gizmo.');
    expect(rows[0]).toContain(
      '| 3 | beta, gamma | 2 | beta: SYNTHETIC Glorper 1; gamma: SYNTHETIC Glorper 2 |',
    );
    // Shape B blocks only Wibbler 1 (beta), solo; the Star Glorper layout reason blocks one card.
    expect(
      rows.some((row) => row.includes('zork each plinth') && row.includes('| 1 | beta | 1 |')),
    ).toBe(true);
    // Per deck: the number of other decks that share the blocker.
    const beta = report.slice(report.indexOf('## Deck: beta'), report.indexOf('## Deck: gamma'));
    expect(beta).toContain('also blocks a card in 1 other deck');
    expect(beta).toContain('also blocks a card in 0 other decks');
    expect(beta).toContain('[solo: one blocker]');
  });

  test('is deterministic, and a folder of .txt files stands for its decks', async () => {
    const a = await invoke([]);
    const b = await invoke([]);
    expect(await readFile(a.outFile, 'utf8')).toBe(await readFile(b.outFile, 'utf8'));
    const { dir, forms } = await setup({ alpha: ALPHA, beta: BETA, gamma: GAMMA });
    const outFile = path.join(dir, 'folder.md');
    const { io } = capture();
    await run(['decks', '--file', forms.gz, '--deck', dir, '--out', outFile], io, {
      repoRoot: dir,
    });
    // The decks given as a folder: the same report.
    expect(await readFile(outFile, 'utf8')).toBe(await readFile(a.outFile, 'utf8'));
  });

  test('a deck with nothing blocked says so', async () => {
    const result = await invoke([], { alpha: ALPHA });
    const report = await readFile(result.outFile, 'utf8');
    expect(report).toContain('No deck has a blocked card.');
  });

  test('bad arguments and unreadable input exit with 2', async () => {
    expect((await invoke(['--download'])).code).toBe(2);
    expect(typeof parseOptions(['decks', '--deck', 'x'])).toBe('string');
    expect(typeof parseOptions(['decks', '--file', 'x'])).toBe('string');
    expect(typeof parseOptions(['coverage', '--file', 'x', '--deck', 'y'])).toBe('string');
    const missingDeck = await invoke(['--deck', '/nonexistent/deck.txt']);
    expect(missingDeck.code).toBe(2);
    expect(missingDeck.err).toContain('cannot read a decklist');
    const { dir, files } = await setup({ alpha: ALPHA });
    const { io, err } = capture();
    const missingBulk = await run(
      ['decks', '--file', path.join(dir, 'missing.jsonl'), '--deck', files[0] ?? ''],
      io,
      { repoRoot: dir },
    );
    expect(missingBulk).toBe(2);
    expect(err.join('\n')).toContain('cannot read');
  });
});
