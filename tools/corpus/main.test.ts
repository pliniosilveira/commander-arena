// The commands end to end (in process), and the real entry point under plain Node.
// SYNTHETIC input only; the network is never touched (fetch is faked).

import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { checkAgainstBaseline, makeBaseline } from './baseline.ts';
import { downloadOracleCards, pickOracleCards, USER_AGENT } from './download.ts';
import { tempDir, writeForms } from './fixture-files.ts';
import { type Io, run } from './main.ts';
import { rankedFiller, syntheticCards } from './synthetic.ts';

const run_ = promisify(execFile);

function capture(): { io: Io; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (t) => out.push(t), err: (t) => err.push(t) }, out, err };
}

async function invoke(args: string[]) {
  const dir = await tempDir();
  const { io, out, err } = capture();
  const code = await run(args, io, { repoRoot: dir });
  return { code, out: out.join('\n'), err: err.join('\n'), dir };
}

describe('pnpm coverage:cards', () => {
  test('writes the three reports and, on request, the baseline', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    const result = await invoke([
      'coverage',
      '--file',
      forms.gz,
      '--out',
      reports,
      '--update-baseline',
    ]);
    expect(result.code).toBe(0);
    expect((await readdir(reports)).sort()).toEqual([
      'backlog.md',
      'coverage-baseline.json',
      'coverage.md',
      'templates.json',
    ]);
    const baseline = JSON.parse(
      await readFile(path.join(reports, 'coverage-baseline.json'), 'utf8'),
    );
    expect(baseline).toMatchObject({
      scope: 'commander-legal',
      all: { supported: 11, total: 23 },
      top500: { supported: 10, total: 21 },
      top1000: { supported: 10, total: 21 },
    });
    expect(result.out).toContain('Supported: 47.83% of all');
  });

  test('does not write a baseline unless asked', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    await invoke(['coverage', '--file', forms.jsonl, '--out', reports]);
    expect(await readdir(reports)).not.toContain('coverage-baseline.json');
  });

  test('the reports are byte-identical on two runs', async () => {
    const forms = await writeForms(syntheticCards());
    const a = await tempDir();
    const b = await tempDir();
    await invoke(['coverage', '--file', forms.gz, '--out', a]);
    await invoke(['coverage', '--file', forms.gz, '--out', b]);
    for (const name of ['coverage.md', 'backlog.md', 'templates.json']) {
      expect(await readFile(path.join(a, name), 'utf8')).toBe(
        await readFile(path.join(b, name), 'utf8'),
      );
    }
  });

  test('--check passes on an equal run and fails when any supported count dropped', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    await invoke(['coverage', '--file', forms.gz, '--out', reports, '--update-baseline']);
    const same = await invoke(['coverage', '--file', forms.gz, '--out', reports, '--check']);
    expect(same.code).toBe(0);
    expect(same.out).toContain('Coverage did not drop.');

    // A corpus where one supported card became unsupported: the counts drop.
    const worse = syntheticCards().map((c) =>
      c.name === 'SYNTHETIC Vanilla 1'
        ? { ...c, oracle_text: 'SYNTHETIC wibble: zork each plinth.' }
        : c,
    );
    const worseForms = await writeForms(worse);
    const dropped = await invoke([
      'coverage',
      '--file',
      worseForms.gz,
      '--out',
      reports,
      '--check',
    ]);
    expect(dropped.code).toBe(1);
    expect(dropped.out).toContain('DROPPED all cards: 10/23');
    expect(dropped.out).toContain('DROPPED top 500: 9/21');
    expect(dropped.out).toContain('Coverage dropped below the baseline.');
  });

  const stats = (all: number, top500: number, top1000: number) => ({
    all: { supported: all, total: 100 },
    top500: { supported: top500, total: 50 },
    top1000: { supported: top1000, total: 60 },
    ranked: 90,
    unranked: 10,
  });
  const base = makeBaseline(stats(50, 25, 30), {
    scope: 'commander-legal',
    source: 'x',
    parserVersion: 1,
  });

  test('--check fails on a drop in only one group of the same bulk file', () => {
    const check = (
      fresh: ReturnType<typeof stats>,
      scope: 'commander-legal' | 'all-cards',
      source = 'x',
    ) => checkAgainstBaseline(fresh, scope, base, source);
    expect(check(stats(51, 26, 31), 'commander-legal').ok).toBe(true);
    expect(check(stats(50, 25, 30), 'commander-legal').ok).toBe(true);
    expect(check(stats(60, 24, 30), 'commander-legal').ok).toBe(false);
    expect(check(stats(60, 25, 29), 'commander-legal').ok).toBe(false);
    expect(check(stats(60, 30, 30), 'all-cards').ok).toBe(false);
  });

  test('--check on the same bulk file fails on a drop in a top list', () => {
    const verdict = checkAgainstBaseline(stats(50, 24, 29), 'commander-legal', base, 'x');
    expect(verdict.ok).toBe(false);
    expect(verdict.lines.join('\n')).toContain('DROPPED top 500');
    expect(verdict.lines.join('\n')).not.toContain('Warning');
  });

  test('--check on a different bulk file warns about the top lists and fails only on all', () => {
    const warned = checkAgainstBaseline(stats(50, 20, 25), 'commander-legal', base, 'y');
    expect(warned.ok).toBe(true);
    const text = warned.lines.join('\n');
    expect(text).toContain('WARNING top 500');
    expect(text).toContain('WARNING top 1,000');
    expect(text).toContain('read "y"');
    expect(text).toContain('made from "x"');
    expect(text).toContain('--update-baseline');
    const failed = checkAgainstBaseline(stats(49, 20, 25), 'commander-legal', base, 'y');
    expect(failed.ok).toBe(false);
    expect(failed.lines.join('\n')).toContain('DROPPED all cards');
    const quiet = checkAgainstBaseline(stats(51, 26, 31), 'commander-legal', base, 'y');
    expect(quiet.ok).toBe(true);
    expect(quiet.lines.join('\n')).not.toContain('Warning');
  });

  test('--check writes nothing and needs a baseline', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    const result = await invoke(['coverage', '--file', forms.gz, '--out', reports, '--check']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('--update-baseline');
    expect(await readdir(reports)).toEqual([]);
  });

  test('--update-baseline replaces the baseline, so a lower number can be accepted', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    await invoke(['coverage', '--file', forms.gz, '--out', reports, '--update-baseline']);
    const worse = syntheticCards().map((c) =>
      c.name === 'SYNTHETIC Vanilla 1'
        ? { ...c, oracle_text: 'SYNTHETIC wibble: zork each plinth.' }
        : c,
    );
    const worseForms = await writeForms(worse);
    await invoke(['coverage', '--file', worseForms.gz, '--out', reports, '--update-baseline']);
    const baseline = JSON.parse(
      await readFile(path.join(reports, 'coverage-baseline.json'), 'utf8'),
    );
    expect(baseline.all.supported).toBe(10);
    expect(
      (await invoke(['coverage', '--file', worseForms.gz, '--out', reports, '--check'])).code,
    ).toBe(0);
  });

  test('--all changes the population, and a baseline made without it is refused', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    await invoke(['coverage', '--file', forms.gz, '--out', reports, '--update-baseline']);
    const all = await invoke([
      'coverage',
      '--file',
      forms.gz,
      '--out',
      reports,
      '--check',
      '--all',
    ]);
    expect(all.code).toBe(1);
    expect(all.out).toContain('covers "commander-legal"');
  });

  test('top 500 / top 1,000 are computed from the rank, in the written report', async () => {
    const forms = await writeForms([...syntheticCards(), ...rankedFiller(1100, 600)]);
    const reports = await tempDir();
    await invoke(['coverage', '--file', forms.gz, '--out', reports]);
    const text = await readFile(path.join(reports, 'coverage.md'), 'utf8');
    // 21 ranked synthetic cards (10 supported) and filler from rank 2000 on, 600 of it supported.
    expect(text).toContain('| Top 500 by EDHREC rank | 489 | 500 | 97.80% |');
    expect(text).toContain('| Top 1,000 by EDHREC rank | 610 | 1,000 | 61.00% |');
  });
});

describe('pnpm corpus:templates', () => {
  test('writes only the template parts', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    const result = await invoke([
      'templates',
      '--file',
      forms.jsonl,
      '--out',
      reports,
      '--max-templates',
      '1',
    ]);
    expect(result.code).toBe(0);
    expect((await readdir(reports)).sort()).toEqual(['backlog.md', 'templates.json']);
    expect(
      JSON.parse(await readFile(path.join(reports, 'templates.json'), 'utf8')).templates,
    ).toHaveLength(1);
  });

  test('refuses the coverage-only options', async () => {
    const forms = await writeForms(syntheticCards());
    const result = await invoke(['templates', '--file', forms.jsonl, '--check']);
    expect(result.code).toBe(2);
    expect(result.err).toContain('belong to coverage:cards');
  });
});

describe('arguments and input errors', () => {
  test('need an input, a known command and valid options', async () => {
    expect((await invoke(['coverage'])).code).toBe(2);
    expect((await invoke(['bogus', '--file', 'x'])).code).toBe(2);
    expect((await invoke(['coverage', '--file', 'x', '--download'])).code).toBe(2);
    expect((await invoke(['coverage', '--file', 'x', '--nope'])).code).toBe(2);
    expect((await invoke(['coverage', '--file', 'x', '--max-templates', '0'])).code).toBe(2);
    expect((await invoke(['coverage', '--file', 'x', '--check', '--update-baseline'])).code).toBe(
      2,
    );
    const help = await invoke(['--help']);
    expect(help.code).toBe(0);
    expect(help.out).toContain('--download');
  });

  test('a missing file or an empty one is exit code 2, not a crash', async () => {
    const dir = await tempDir();
    const missing = await invoke([
      'coverage',
      '--file',
      path.join(dir, 'nope.jsonl.gz'),
      '--out',
      dir,
    ]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain('cannot read');
    const empty = path.join(dir, 'empty.jsonl');
    await writeFile(empty, '');
    const none = await invoke(['coverage', '--file', empty, '--out', dir]);
    expect(none.code).toBe(2);
    expect(none.err).toContain('no card could be analysed');
  });
});

describe('download (fake fetch, no network)', () => {
  const listing = (extra: Record<string, unknown> = {}) => ({
    data: [
      { type: 'rulings', jsonl_download_uri: 'https://data.example/rulings.jsonl.gz' },
      {
        type: 'oracle_cards',
        updated_at: '2026-10-21T09:10:11.123+00:00',
        compressed_size: 0,
        jsonl_download_uri: 'https://data.example/oracle.jsonl.gz',
        ...extra,
      },
    ],
  });

  function fakeFetch(body: Uint8Array, entry: object = listing()) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
      if (String(url).startsWith('https://api.scryfall.com/bulk-data')) {
        return new Response(JSON.stringify(entry), { status: 200 });
      }
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    return { fetchFn, calls };
  }

  test('lists the bulk files, streams the oracle_cards file to the cache and sends the headers', async () => {
    const text = `${syntheticCards()
      .map((c) => JSON.stringify(c))
      .join('\n')}\n`;
    const gz = gzipSync(text);
    const { fetchFn, calls } = fakeFetch(gz, listing({ compressed_size: gz.length }));
    const cacheDir = path.join(await tempDir(), 'cache');
    const logs: string[] = [];
    const file = await downloadOracleCards({ cacheDir, fetch: fetchFn, log: (m) => logs.push(m) });
    expect(file).toBe(path.join(cacheDir, 'oracle_cards-2026-10-21T09-10-11-123-00-00.jsonl.gz'));
    expect(Buffer.compare(await readFile(file), gz)).toBe(0);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.scryfall.com/bulk-data',
      'https://data.example/oracle.jsonl.gz',
    ]);
    for (const call of calls) {
      expect(call.headers.Accept).toBe('application/json');
      expect(call.headers['User-Agent']).toBe(USER_AGENT);
    }
    expect(USER_AGENT).toMatch(/^CommanderArena-corpus\//);
    // A second call finds the file in the cache and does not download again.
    const again = fakeFetch(gz, listing({ compressed_size: gz.length }));
    await downloadOracleCards({ cacheDir, fetch: again.fetchFn, log: (m) => logs.push(m) });
    expect(again.calls).toHaveLength(1);
    expect(logs.join('\n')).toContain('Using the cached file');
  });

  test('--download goes through run() and then analyses the downloaded file', async () => {
    const gz = gzipSync(
      `${syntheticCards()
        .map((c) => JSON.stringify(c))
        .join('\n')}\n`,
    );
    const { fetchFn } = fakeFetch(gz, listing({ compressed_size: gz.length }));
    const root = await tempDir();
    const { io, out } = capture();
    const code = await run(['coverage', '--download'], io, { repoRoot: root, fetch: fetchFn });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Supported: 47.83% of all');
    expect(await readdir(path.join(root, 'reports'))).toContain('coverage.md');
    expect(
      (await readdir(path.join(root, '.cache/corpus'))).some((f) => f.endsWith('.jsonl.gz')),
    ).toBe(true);
  });

  test('reports a bulk list without jsonl_download_uri, and an HTTP error', async () => {
    expect(pickOracleCards({ data: [{ type: 'oracle_cards', download_uri: 'x' }] })).toBeInstanceOf(
      Error,
    );
    expect(pickOracleCards({ data: [] })).toBeInstanceOf(Error);
    expect(pickOracleCards({})).toBeInstanceOf(Error);
    const failing = (async () => new Response('no', { status: 503 })) as typeof fetch;
    const { io, err } = capture();
    const code = await run(['coverage', '--download'], io, {
      repoRoot: await tempDir(),
      fetch: failing,
    });
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('HTTP 503');
  });
});

describe('the real entry point', () => {
  test('runs under plain `node` with type stripping (no bundler)', async () => {
    const forms = await writeForms(syntheticCards());
    const reports = await tempDir();
    const cli = path.resolve(import.meta.dirname, 'cli.ts');
    const { stdout } = await run_(process.execPath, [
      cli,
      'coverage',
      '--file',
      forms.gz,
      '--out',
      reports,
    ]);
    expect(stdout).toContain('23 cards analysed, 12 unsupported');
    expect(await readFile(path.join(reports, 'coverage.md'), 'utf8')).toContain(
      '| All | 11 | 23 | 47.83% |',
    );
    await expect(
      run_(process.execPath, [cli, 'coverage', '--file', path.join(reports, 'missing.jsonl')]),
    ).rejects.toMatchObject({ code: 2 });
  }, 60_000);
});
