// `pnpm rules:fetch`: download the current Comprehensive Rules (CR) plain text into docs/rules/.
//
//   pnpm rules:fetch                   discover the .txt link on https://magic.wizards.com/en/rules,
//                                      download it, parse it, write docs/rules/rules-source.json
//   pnpm rules:fetch --dry-run         discover and print the link, download nothing
//   pnpm rules:fetch --url <url>       download this URL instead of discovering one
//   pnpm rules:fetch --force           replace an existing docs/rules/comprehensive-rules.txt
//
// Exit codes: 0 ok, 1 file exists (use --force), 3 network failure, 4 no usable link on the page,
// 5 downloaded content refused (HTML, empty or too large), 6 could not write the files,
// 7 file installed but the parser found no rules, 64 usage error.
//
// The discovery heuristics are in fetch-discover.ts.

import { existsSync } from 'node:fs';
import { type CliIo, processIo } from './cli-io.ts';
import type { LinkCandidate } from './fetch-discover.ts';
import { chooseCandidate, extractCandidates } from './fetch-discover.ts';
import { buildRulesSource, describeError, installFiles } from './fetch-files.ts';
import {
  CR_FILE,
  CR_FILE_REPO_PATH,
  isMainModule,
  RULES_PAGE_URL,
  RULES_VERSION_REPO_PATH,
  SOURCE_FILE,
  SOURCE_FILE_REPO_PATH,
} from './paths.ts';

export const USER_AGENT =
  'CommanderArena-tools/0.0.0 (+https://github.com/pliniosilveira/commander-arena)';
export const ACCEPT_PAGE = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';
export const ACCEPT_TEXT = 'text/plain,text/*;q=0.9,*/*;q=0.5';

export const EXIT_OK = 0;
export const EXIT_EXISTS = 1;
export const EXIT_NETWORK = 3;
export const EXIT_NO_LINK = 4;
export const EXIT_REFUSED = 5;
export const EXIT_WRITE = 6;
export const EXIT_UNPARSEABLE = 7;
export const EXIT_USAGE = 64;

const PAGE_TIMEOUT_MS = 30_000;
const FILE_TIMEOUT_MS = 120_000;
/** The CR is a couple of megabytes; anything far beyond that is not the CR text file. */
const MAX_BYTES = 25 * 1024 * 1024;

export interface FetchCliDeps {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly crPath: string;
  readonly sourcePath: string;
  readonly io: CliIo;
}

export const USAGE = [
  'Usage: pnpm rules:fetch [--dry-run] [--url <url>] [--force]',
  '',
  `  (no flags)   find the plain text link on ${RULES_PAGE_URL}, download it to`,
  `               ${CR_FILE_REPO_PATH} and write ${SOURCE_FILE_REPO_PATH}`,
  '  --dry-run    find and print the link, download nothing, write nothing',
  '  --url <url>  download this URL instead of discovering one',
  '  --force      replace an existing file (the old one is overwritten)',
  '  --help       show this help',
];

interface FetchArgs {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly help: boolean;
  readonly url: string | null;
  readonly errors: readonly string[];
}

export function parseFetchArgs(argv: readonly string[]): FetchArgs {
  const errors: string[] = [];
  let dryRun = false;
  let force = false;
  let help = false;
  let url: string | null = null;
  let wantsUrl = false;
  for (const arg of argv) {
    if (wantsUrl) {
      url = arg;
      wantsUrl = false;
    } else if (arg === '--') {
      // Some package manager versions pass the separator through.
    } else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--force') force = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--url') wantsUrl = true;
    else if (arg.startsWith('--url=')) url = arg.slice('--url='.length);
    else errors.push(`Unknown argument: ${arg}`);
  }
  if (wantsUrl) errors.push('--url needs a value.');
  if (url !== null) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        errors.push(`--url must be an http or https URL, got "${url}".`);
      }
    } catch {
      errors.push(`--url is not a valid URL: "${url}".`);
    }
  }
  return { dryRun, force, help, url, errors };
}

type Requested =
  | { readonly ok: true; readonly host: string; readonly response: Response }
  | { readonly ok: false; readonly host: string; readonly detail: string };

async function request(
  deps: FetchCliDeps,
  url: string,
  accept: string,
  timeoutMs: number,
): Promise<Requested> {
  const host = new URL(url).host;
  try {
    const response = await deps.fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { ok: false, host, detail: `HTTP ${response.status} ${response.statusText}`.trim() };
    }
    return { ok: true, host, response };
  } catch (error) {
    return { ok: false, host, detail: describeError(error) };
  }
}

function reportNetworkFailure(io: CliIo, host: string, url: string, detail: string): number {
  io.err(`Network failure: could not fetch ${url}`);
  io.err(`  Host that failed: ${host}`);
  io.err(`  Detail: ${detail}`);
  io.err('');
  io.err('  - Node fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set. If this machine');
  io.err(
    '    reaches the internet through a proxy, retry as:  NODE_USE_ENV_PROXY=1 pnpm rules:fetch',
  );
  io.err('  - Cloud sessions and some corporate networks block hosts by policy (an HTTP 403 or a');
  io.err('    failed CONNECT tunnel usually means that). Do not work around a block.');
  io.err(`  - Fallback: save the plain text Comprehensive Rules by hand as ${CR_FILE_REPO_PATH}`);
  io.err(`    (get it from ${RULES_PAGE_URL}) and update ${RULES_VERSION_REPO_PATH}.`);
  return EXIT_NETWORK;
}

function printCandidates(io: CliIo, pageUrl: string, candidates: readonly LinkCandidate[]): void {
  if (candidates.length === 0) {
    io.out(`No links to .txt, .pdf, .doc or .docx files were found in ${pageUrl}.`);
    return;
  }
  io.out(`Candidate document links found in ${pageUrl} (${candidates.length}):`);
  candidates.forEach((c, i) => {
    io.out(`  ${i + 1}. [${c.format}] score ${c.score}  ${c.url}`);
    if (c.linkText !== '') io.out(`       link text: ${c.linkText}`);
    if (c.reasons.length > 0) io.out(`       ${c.reasons.join('; ')}`);
  });
}

interface Resolved {
  readonly url: string;
  readonly discovery: 'rules-page' | 'explicit-url';
}

/** Returns the URL to download, or an exit code when none could be determined. */
async function resolveUrl(
  deps: FetchCliDeps,
  explicit: string | null,
): Promise<Resolved | { readonly exit: number }> {
  const { io } = deps;
  if (explicit !== null) {
    io.out(`Using the explicit URL: ${explicit}`);
    return { url: explicit, discovery: 'explicit-url' };
  }
  io.out(`Requesting ${RULES_PAGE_URL}`);
  const page = await request(deps, RULES_PAGE_URL, ACCEPT_PAGE, PAGE_TIMEOUT_MS);
  if (!page.ok) return { exit: reportNetworkFailure(io, page.host, RULES_PAGE_URL, page.detail) };
  let html: string;
  try {
    html = await page.response.text();
  } catch (error) {
    return {
      exit: reportNetworkFailure(io, page.host, RULES_PAGE_URL, describeError(error)),
    };
  }
  const candidates = extractCandidates(html, page.response.url || RULES_PAGE_URL);
  printCandidates(io, RULES_PAGE_URL, candidates);
  const choice = chooseCandidate(candidates);
  if (choice.kind === 'chosen') {
    io.out(`Selected: ${choice.candidate.url} (${choice.why})`);
    return { url: choice.candidate.url, discovery: 'rules-page' };
  }
  io.err('');
  if (choice.kind === 'ambiguous') {
    io.err('Several plain text links look equally likely, so none was chosen:');
    for (const c of choice.candidates) io.err(`  ${c.url}`);
  } else {
    io.err('No plain text (.txt) link that looks like the Comprehensive Rules was found.');
    io.err('The page may build its links with JavaScript, or its layout may have changed.');
  }
  io.err('Pick the right link by hand and run:  pnpm rules:fetch --url <url>');
  return { exit: EXIT_NO_LINK };
}

function looksLikeHtml(bytes: Uint8Array, contentType: string | null): boolean {
  if (contentType !== null && /text\/html|application\/xhtml/i.test(contentType)) return true;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<head>');
}

/**
 * Runs the downloader and returns the exit code. Dependencies (fetch, clock, paths, output) can be
 * replaced, so tests run it without a network or the real docs/rules directory.
 */
export async function runFetchCli(
  argv: readonly string[],
  overrides: Partial<FetchCliDeps> = {},
): Promise<number> {
  const deps: FetchCliDeps = {
    fetch: overrides.fetch ?? fetch,
    now: overrides.now ?? (() => new Date()),
    crPath: overrides.crPath ?? CR_FILE,
    sourcePath: overrides.sourcePath ?? SOURCE_FILE,
    io: overrides.io ?? processIo,
  };
  const { io } = deps;
  const args = parseFetchArgs(argv);

  if (args.help) {
    for (const line of USAGE) io.out(line);
    return EXIT_OK;
  }
  if (args.errors.length > 0) {
    for (const error of args.errors) io.err(error);
    io.err('');
    for (const line of USAGE) io.err(line);
    return EXIT_USAGE;
  }
  if (!args.dryRun && !args.force && existsSync(deps.crPath)) {
    io.err(`${CR_FILE_REPO_PATH} already exists (${deps.crPath}). Nothing was downloaded.`);
    io.err(
      'Use --force to replace it. The old file is overwritten, so keep a copy if you need it.',
    );
    return EXIT_EXISTS;
  }

  const resolved = await resolveUrl(deps, args.url);
  if ('exit' in resolved) return resolved.exit;
  if (args.dryRun) {
    io.out('');
    io.out(`Dry run: would download ${resolved.url}`);
    io.out('Nothing was downloaded and no file was written.');
    return EXIT_OK;
  }

  io.out(`Downloading ${resolved.url}`);
  const download = await request(deps, resolved.url, ACCEPT_TEXT, FILE_TIMEOUT_MS);
  if (!download.ok) return reportNetworkFailure(io, download.host, resolved.url, download.detail);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await download.response.arrayBuffer());
  } catch (error) {
    return reportNetworkFailure(io, download.host, resolved.url, describeError(error));
  }
  const contentType = download.response.headers.get('content-type');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES || looksLikeHtml(bytes, contentType)) {
    io.err(
      `Refusing the download: it is empty, larger than ${MAX_BYTES} bytes, or looks like HTML`,
    );
    io.err(`(received ${bytes.byteLength} bytes, content-type ${contentType ?? 'none'}).`);
    io.err('That is not the plain text Comprehensive Rules. Nothing was written.');
    return EXIT_REFUSED;
  }

  const source = buildRulesSource({
    bytes,
    sourceUrl: download.response.url || resolved.url,
    requestedUrl: resolved.url,
    discovery: resolved.discovery,
    fetchedAt: deps.now().toISOString(),
  });
  const installed = installFiles(deps, bytes, source);
  if (!installed.ok) {
    io.err(`Could not write the files: ${installed.detail}`);
    if (installed.crInstalled) {
      io.err(`${CR_FILE_REPO_PATH} was written but ${SOURCE_FILE_REPO_PATH} was not.`);
      io.err('Run again with --force so the metadata matches the file.');
    } else {
      io.err('No partial file was left behind.');
    }
    return EXIT_WRITE;
  }

  io.out('');
  io.out(`Wrote ${CR_FILE_REPO_PATH} (${source.byteSize} bytes, ${source.encoding})`);
  io.out(`Wrote ${SOURCE_FILE_REPO_PATH}`);
  io.out(`  source URL:      ${source.sourceUrl}`);
  io.out(`  file name:       ${source.originalFileName}`);
  io.out(`  sha256:          ${source.sha256}`);
  io.out(`  fetched at:      ${source.fetchedAt}`);
  io.out(`  effective date:  ${source.effectiveDateText ?? 'NOT FOUND in the text'}`);
  io.out(
    `  parsed:          ${source.parse.rules} rules, ${source.parse.subrules} sub-rules, ` +
      `${source.parse.glossaryEntries} glossary entries, ${source.parse.unparsedLines} unparsed lines`,
  );
  io.out('');
  io.out(
    `Next: run pnpm rule --check, then fill in ${RULES_VERSION_REPO_PATH} (checklist inside).`,
  );
  if (source.parse.rules + source.parse.subrules === 0) {
    io.err('');
    io.err('WARNING: the file was installed but the parser recognized no numbered rules. The real');
    io.err('format differs from the parser assumptions (docs/rules/README.md). Inspect the file.');
    return EXIT_UNPARSEABLE;
  }
  return EXIT_OK;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await runFetchCli(process.argv.slice(2));
}
