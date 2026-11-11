// Tests for the CR downloader. No test touches the network: `fetch` is replaced by a fake, and the
// output files go to a temporary directory. The page HTML and the CR body are SYNTHETIC (the body
// is the synthetic fixture), so these tests prove the download, hashing and atomic-write behavior,
// not that the real Wizards page can be parsed.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ACCEPT_PAGE,
  ACCEPT_TEXT,
  EXIT_EXISTS,
  EXIT_NETWORK,
  EXIT_NO_LINK,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_UNPARSEABLE,
  EXIT_USAGE,
  EXIT_WRITE,
  parseFetchArgs,
  runFetchCli,
  USER_AGENT,
} from './fetch-cr.ts';
import { RULES_PAGE_URL } from './paths.ts';

const FIXTURE_BYTES = readFileSync(new URL('./fixtures/synthetic-cr.txt', import.meta.url));
const FILE_URL = 'https://files.example.invalid/dl/SynthCompRules%2020990303.txt';
// SYNTHETIC page: invented markup, not the real Wizards page.
const PAGE_HTML = `<html><body>
  <a href="${FILE_URL}">Comprehensive Rules (TXT)</a>
  <a href="https://files.example.invalid/dl/SynthCompRules%2020990303.pdf">PDF</a>
</body></html>`;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Setup {
  readonly dir: string;
  readonly crPath: string;
  readonly sourcePath: string;
}

function setup(): Setup {
  const dir = mkdtempSync(path.join(tmpdir(), 'rules-fetch-'));
  dirs.push(dir);
  return {
    dir,
    crPath: path.join(dir, 'comprehensive-rules.txt'),
    sourcePath: path.join(dir, 'rules-source.json'),
  };
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

interface FakeFetch {
  readonly fetch: typeof fetch;
  readonly calls: { url: string; headers: Record<string, string> }[];
}

function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function fakeFetch(routes: Record<string, Handler>): FakeFetch {
  const calls: FakeFetch['calls'] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers as Record<string, string> | undefined) } });
    const handler = routes[url];
    if (!handler) throw new TypeError(`unexpected request to ${url}`);
    return handler(init);
  };
  return { fetch: impl as typeof fetch, calls };
}

const okPage: Handler = () =>
  withUrl(new Response(PAGE_HTML, { headers: { 'content-type': 'text/html' } }), RULES_PAGE_URL);
const okFile: Handler = () =>
  withUrl(new Response(FIXTURE_BYTES, { headers: { 'content-type': 'text/plain' } }), FILE_URL);

interface Result {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function run(
  argv: string[],
  s: Setup,
  fake: FakeFetch,
  now = new Date('2026-10-21T12:34:56.000Z'),
): Promise<Result> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runFetchCli(argv, {
    fetch: fake.fetch,
    now: () => now,
    crPath: s.crPath,
    sourcePath: s.sourcePath,
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('--dry-run', () => {
  test('discovers and prints every candidate, downloads nothing, writes nothing', async () => {
    const s = setup();
    const fake = fakeFetch({ [RULES_PAGE_URL]: okPage });
    const r = await run(['--dry-run'], s, fake);
    expect(r.code).toBe(EXIT_OK);
    expect(fake.calls.map((c) => c.url)).toEqual([RULES_PAGE_URL]);
    expect(r.out).toContain('Candidate document links found');
    expect(r.out).toContain(FILE_URL);
    expect(r.out).toContain('SynthCompRules%2020990303.pdf');
    expect(r.out).toContain(`Selected: ${FILE_URL}`);
    expect(r.out).toContain(`Dry run: would download ${FILE_URL}`);
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('works even when the output file already exists, and leaves it alone', async () => {
    const s = setup();
    writeFileSync(s.crPath, 'existing');
    const r = await run(['--dry-run'], s, fakeFetch({ [RULES_PAGE_URL]: okPage }));
    expect(r.code).toBe(EXIT_OK);
    expect(readFileSync(s.crPath, 'utf8')).toBe('existing');
  });

  test('with --url prints the URL and makes no request at all', async () => {
    const s = setup();
    const fake = fakeFetch({});
    const r = await run(['--dry-run', '--url', FILE_URL], s, fake);
    expect(r.code).toBe(EXIT_OK);
    expect(fake.calls).toEqual([]);
    expect(r.out).toContain(`Dry run: would download ${FILE_URL}`);
  });
});

describe('a successful download', () => {
  test('writes the CR file byte for byte and a rules-source.json with the required fields', async () => {
    const s = setup();
    const fake = fakeFetch({ [RULES_PAGE_URL]: okPage, [FILE_URL]: okFile });
    const r = await run([], s, fake);
    expect(r.code).toBe(EXIT_OK);
    expect(readFileSync(s.crPath).equals(FIXTURE_BYTES)).toBe(true);

    const source = JSON.parse(readFileSync(s.sourcePath, 'utf8'));
    expect(source).toMatchObject({
      schema: 1,
      sourceUrl: FILE_URL,
      requestedUrl: FILE_URL,
      discovery: 'rules-page',
      originalFileName: 'SynthCompRules 20990303.txt',
      sha256: createHash('sha256').update(FIXTURE_BYTES).digest('hex'),
      byteSize: FIXTURE_BYTES.byteLength,
      fetchedAt: '2026-10-21T12:34:56.000Z',
      encoding: 'utf-8-bom',
      effectiveDate: '2099-03-03',
      effectiveDateText: 'March 3, 2099',
    });
    expect(source.parse).toMatchObject({
      rules: 16,
      subrules: 12,
      glossaryEntries: 5,
      unparsedLines: 1,
    });
    expect(r.out).toContain(source.sha256);
    expect(r.out).toContain('docs/rules/RULES_VERSION.md');
  });

  test('sends the descriptive User-Agent and an Accept header on both requests', async () => {
    const s = setup();
    const fake = fakeFetch({ [RULES_PAGE_URL]: okPage, [FILE_URL]: okFile });
    await run([], s, fake);
    expect(USER_AGENT).toBe(
      'CommanderArena-tools/0.0.0 (+https://github.com/pliniosilveira/commander-arena)',
    );
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: ACCEPT_PAGE });
    expect(fake.calls[1]?.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: ACCEPT_TEXT });
  });

  test('leaves no temporary files behind', async () => {
    const s = setup();
    await run([], s, fakeFetch({ [RULES_PAGE_URL]: okPage, [FILE_URL]: okFile }));
    expect(readdirSync(s.dir).sort()).toEqual(['comprehensive-rules.txt', 'rules-source.json']);
  });

  test('records the final URL after a redirect and the original file name from it', async () => {
    const s = setup();
    const finalUrl = 'https://cdn.example.invalid/final/CompRules%20FINAL.txt';
    const redirected: Handler = () => withUrl(new Response(FIXTURE_BYTES), finalUrl);
    const r = await run(['--url', FILE_URL], s, fakeFetch({ [FILE_URL]: redirected }));
    expect(r.code).toBe(EXIT_OK);
    const source = JSON.parse(readFileSync(s.sourcePath, 'utf8'));
    expect(source).toMatchObject({
      sourceUrl: finalUrl,
      requestedUrl: FILE_URL,
      discovery: 'explicit-url',
      originalFileName: 'CompRules FINAL.txt',
    });
  });

  test('--url skips the rules page', async () => {
    const s = setup();
    const fake = fakeFetch({ [FILE_URL]: okFile });
    const r = await run(['--url', FILE_URL], s, fake);
    expect(r.code).toBe(EXIT_OK);
    expect(fake.calls.map((c) => c.url)).toEqual([FILE_URL]);
  });

  test('decodes a Windows-1252 download and records the encoding', async () => {
    const s = setup();
    const cp1252 = Buffer.from(
      [
        'Title',
        '',
        'These rules are effective as of May 5, 2099.',
        '',
        '1. One',
        '100. General',
        '100.1. Syn\x92thetic.',
      ].join('\r\n'),
      'latin1',
    );
    const r = await run(
      ['--url', FILE_URL],
      s,
      fakeFetch({ [FILE_URL]: () => new Response(cp1252) }),
    );
    expect(r.code).toBe(EXIT_OK);
    expect(JSON.parse(readFileSync(s.sourcePath, 'utf8'))).toMatchObject({
      encoding: 'windows-1252',
      effectiveDate: '2099-05-05',
    });
    expect(readFileSync(s.crPath).equals(cp1252)).toBe(true);
  });
});

describe('overwrite protection', () => {
  test('refuses to replace an existing file without --force and makes no request', async () => {
    const s = setup();
    writeFileSync(s.crPath, 'existing text');
    const fake = fakeFetch({ [RULES_PAGE_URL]: okPage, [FILE_URL]: okFile });
    const r = await run([], s, fake);
    expect(r.code).toBe(EXIT_EXISTS);
    expect(r.err).toContain('--force');
    expect(fake.calls).toEqual([]);
    expect(readFileSync(s.crPath, 'utf8')).toBe('existing text');
    expect(existsSync(s.sourcePath)).toBe(false);
  });

  test('--force replaces it atomically', async () => {
    const s = setup();
    writeFileSync(s.crPath, 'existing text');
    const r = await run(
      ['--force'],
      s,
      fakeFetch({ [RULES_PAGE_URL]: okPage, [FILE_URL]: okFile }),
    );
    expect(r.code).toBe(EXIT_OK);
    expect(readFileSync(s.crPath).equals(FIXTURE_BYTES)).toBe(true);
    expect(readdirSync(s.dir).sort()).toEqual(['comprehensive-rules.txt', 'rules-source.json']);
  });

  test('a failed download with --force leaves the existing file untouched', async () => {
    const s = setup();
    writeFileSync(s.crPath, 'existing text');
    const r = await run(
      ['--force', '--url', FILE_URL],
      s,
      fakeFetch({ [FILE_URL]: () => new Response('nope', { status: 500 }) }),
    );
    expect(r.code).toBe(EXIT_NETWORK);
    expect(readFileSync(s.crPath, 'utf8')).toBe('existing text');
    expect(readdirSync(s.dir)).toEqual(['comprehensive-rules.txt']);
  });
});

describe('failures', () => {
  test('a network failure on the rules page exits 3 and names the host, the proxy variable and policy', async () => {
    const s = setup();
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND magic.wizards.com'), {
      code: 'ENOTFOUND',
    });
    const r = await run(
      [],
      s,
      fakeFetch({
        [RULES_PAGE_URL]: () => {
          throw new TypeError('fetch failed', { cause });
        },
      }),
    );
    expect(r.code).toBe(EXIT_NETWORK);
    expect(r.err).toContain('Host that failed: magic.wizards.com');
    expect(r.err).toContain('ENOTFOUND');
    expect(r.err).toContain('NODE_USE_ENV_PROXY=1');
    expect(r.err).toContain('HTTPS_PROXY');
    expect(r.err).toContain('block');
    expect(r.err).toContain('policy');
    expect(r.err).toContain('docs/rules/RULES_VERSION.md');
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('an HTTP error status on the rules page counts as a network failure', async () => {
    const s = setup();
    const r = await run(
      ['--dry-run'],
      s,
      fakeFetch({
        [RULES_PAGE_URL]: () => new Response('denied', { status: 403, statusText: 'Forbidden' }),
      }),
    );
    expect(r.code).toBe(EXIT_NETWORK);
    expect(r.err).toContain('HTTP 403 Forbidden');
    expect(r.err).toContain('magic.wizards.com');
  });

  test('an HTTP error on the download exits 3 naming the download host and writes nothing', async () => {
    const s = setup();
    const r = await run(
      [],
      s,
      fakeFetch({
        [RULES_PAGE_URL]: okPage,
        [FILE_URL]: () => new Response('denied', { status: 403, statusText: 'Forbidden' }),
      }),
    );
    expect(r.code).toBe(EXIT_NETWORK);
    expect(r.err).toContain('Host that failed: files.example.invalid');
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('a download that breaks midway writes nothing, not even a partial file', async () => {
    const s = setup();
    const broken: Handler = () => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(FIXTURE_BYTES.subarray(0, 500));
          } else {
            controller.error(new TypeError('terminated'));
          }
        },
      });
      return withUrl(new Response(body), FILE_URL);
    };
    const r = await run(['--url', FILE_URL], s, fakeFetch({ [FILE_URL]: broken }));
    expect(r.code).toBe(EXIT_NETWORK);
    expect(r.err).toContain('terminated');
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('an HTML response is refused as not the rules text', async () => {
    const s = setup();
    const r = await run(
      ['--url', FILE_URL],
      s,
      fakeFetch({
        [FILE_URL]: () => new Response('<!DOCTYPE html><html><body>Sign in</body></html>'),
      }),
    );
    expect(r.code).toBe(EXIT_REFUSED);
    expect(r.err).toContain('looks like HTML');
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('an empty response and an HTML content type are refused too', async () => {
    const s = setup();
    expect(
      (await run(['--url', FILE_URL], s, fakeFetch({ [FILE_URL]: () => new Response('') }))).code,
    ).toBe(EXIT_REFUSED);
    const typed = fakeFetch({
      [FILE_URL]: () =>
        new Response('plain looking', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    expect((await run(['--url', FILE_URL], s, typed)).code).toBe(EXIT_REFUSED);
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('a page with no plain text link exits 4 and points at --url', async () => {
    const s = setup();
    const r = await run(
      [],
      s,
      fakeFetch({ [RULES_PAGE_URL]: () => new Response('<html><a href="/x.pdf">PDF</a></html>') }),
    );
    expect(r.code).toBe(EXIT_NO_LINK);
    expect(r.out).toContain('/x.pdf');
    expect(r.err).toContain('pnpm rules:fetch --url <url>');
    expect(readdirSync(s.dir)).toEqual([]);
  });

  test('an ambiguous page exits 4 and lists the contenders', async () => {
    const s = setup();
    const html = `<a href="https://f.example.invalid/CompRulesA.txt">TXT</a>
      <a href="https://f.example.invalid/CompRulesB.txt">TXT</a>`;
    const r = await run([], s, fakeFetch({ [RULES_PAGE_URL]: () => new Response(html) }));
    expect(r.code).toBe(EXIT_NO_LINK);
    expect(r.err).toContain('CompRulesA.txt');
    expect(r.err).toContain('CompRulesB.txt');
  });

  test('a write failure exits 6 and leaves no partial file', async () => {
    const s = setup();
    const blocker = path.join(s.dir, 'blocker');
    writeFileSync(blocker, 'a file where a directory is needed');
    const broken: Setup = {
      dir: s.dir,
      crPath: path.join(blocker, 'comprehensive-rules.txt'),
      sourcePath: path.join(blocker, 'rules-source.json'),
    };
    const r = await run(['--url', FILE_URL], broken, fakeFetch({ [FILE_URL]: okFile }));
    expect(r.code).toBe(EXIT_WRITE);
    expect(r.err).toContain('No partial file was left behind');
    expect(readdirSync(s.dir)).toEqual(['blocker']);
  });

  test('if only the metadata cannot be written the message says the CR file was installed', async () => {
    const s = setup();
    mkdirSync(s.sourcePath);
    writeFileSync(path.join(s.sourcePath, 'keeps-it-non-empty'), 'x');
    const r = await run(['--url', FILE_URL], s, fakeFetch({ [FILE_URL]: okFile }));
    expect(r.code).toBe(EXIT_WRITE);
    expect(r.err).toContain('was written but docs/rules/rules-source.json was not');
    expect(r.err).toContain('--force');
    expect(readFileSync(s.crPath).equals(FIXTURE_BYTES)).toBe(true);
    expect(readdirSync(s.dir).sort()).toEqual(['comprehensive-rules.txt', 'rules-source.json']);
  });

  test('a download the parser cannot read is installed with a loud warning and exit 7', async () => {
    const s = setup();
    const r = await run(
      ['--url', FILE_URL],
      s,
      fakeFetch({
        [FILE_URL]: () => new Response('This is plain text\nbut not numbered rules.\n'),
      }),
    );
    expect(r.code).toBe(EXIT_UNPARSEABLE);
    expect(r.err).toContain('recognized no numbered rules');
    expect(existsSync(s.crPath)).toBe(true);
    expect(JSON.parse(readFileSync(s.sourcePath, 'utf8')).effectiveDate).toBeNull();
  });
});

describe('arguments', () => {
  test('parseFetchArgs reads every flag', () => {
    expect(
      parseFetchArgs(['--dry-run', '--force', '--url', 'https://a.example.invalid/x.txt']),
    ).toMatchObject({
      dryRun: true,
      force: true,
      url: 'https://a.example.invalid/x.txt',
      errors: [],
    });
    expect(parseFetchArgs(['--url=https://a.example.invalid/x.txt']).url).toBe(
      'https://a.example.invalid/x.txt',
    );
    expect(parseFetchArgs(['--']).errors).toEqual([]);
  });

  test('bad arguments exit 64 without any request', async () => {
    for (const argv of [
      ['--bogus'],
      ['--url'],
      ['--url', 'not a url'],
      ['--url', 'ftp://x.example.invalid/a.txt'],
    ]) {
      const s = setup();
      const fake = fakeFetch({});
      const r = await run(argv, s, fake);
      expect(r.code).toBe(EXIT_USAGE);
      expect(fake.calls).toEqual([]);
    }
  });

  test('--help prints usage and exits 0', async () => {
    const r = await run(['--help'], setup(), fakeFetch({}));
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('pnpm rules:fetch');
  });
});
