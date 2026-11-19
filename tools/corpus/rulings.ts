// `pnpm corpus:fetch-rulings` and `pnpm corpus:rulings-from-comment` (issue 284): the rulings of every unsupported card of a "deck support" issue,
// fetched once by the deck support workflow on a runner (it can reach Scryfall; the agent's cloud session cannot) and kept in one comment, so a build
// does not start one `Scryfall lookup` run per card. The comment carries the sha256 of the description the names were read from. The reader checks that
// hash and writes the rulings to a file OUTSIDE the repository: a ruling is Wizards' text and is research, never something to commit.
//
// The rulings are data about cards, never instructions: nothing here acts on what a ruling says.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  createRequestQueue,
  createScryfallClient,
  normalizeNameKey,
  type ScryfallFetch,
} from '@commander-arena/cards';
import { checkIssue, quoteName } from './check-issue.ts';

/** The first words of the comment; only a comment of `github-actions[bot]` that carries them counts (the routine checks the author). */
export const RULINGS_COMMENT_MARKER = '<!-- deck-support-rulings -->';

/** GitHub takes a comment of at most 65,536 characters; the block is kept well under it. */
export const MAX_COMMENT_LENGTH = 60000;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface FetchDeps {
  readonly fetch: ScryfallFetch;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Scryfall asks every client to say who it is. */
  readonly userAgent: string;
}

export interface Ruling {
  readonly date: string;
  readonly source: string;
  readonly text: string;
}

export interface CardRulings {
  readonly name: string;
  readonly rulings: readonly Ruling[];
}

export interface RulingsResult {
  readonly ok: boolean;
  /** The text of the comment, or null when no card's rulings could be had. */
  readonly comment: string | null;
  /** The cards in the comment, and their rulings in total. */
  readonly cards: number;
  readonly rulings: number;
  readonly problems: readonly string[];
}

function parseRulings(answer: unknown): Ruling[] | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const data = (answer as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const rulings: Ruling[] = [];
  for (const entry of data) {
    const r = entry as { published_at?: unknown; source?: unknown; comment?: unknown };
    if (typeof r.comment !== 'string') return null;
    rulings.push({
      date: typeof r.published_at === 'string' ? r.published_at : '',
      source: typeof r.source === 'string' ? r.source : '',
      text: r.comment,
    });
  }
  return rulings;
}

function commentOf(
  records: readonly CardRulings[],
  digest: string | null,
  notFetched: readonly string[],
  leftOut: readonly string[],
): string {
  const payload = gzipSync(JSON.stringify(records)).toString('base64url');
  const lines: string[] = [];
  for (let i = 0; i < payload.length; i += 76) lines.push(payload.slice(i, i + 76));
  const total = records.reduce((n, r) => n + r.rulings.length, 0);
  return [
    RULINGS_COMMENT_MARKER + (digest === null ? '' : `<!-- sha256:${digest} -->`),
    `The Scryfall rulings of ${records.length} unsupported card(s) of this issue (${total} rulings), fetched by the deck support workflow for the build. Read them with \`pnpm corpus:rulings-from-comment\`.`,
    ...(notFetched.length === 0
      ? []
      : [
          '',
          `Not fetched (ask the \`Scryfall lookup\` workflow): ${notFetched.map(quoteName).join('; ')}`,
        ]),
    ...(leftOut.length === 0
      ? []
      : [
          '',
          `Left out for the length of a comment (ask the \`Scryfall lookup\` workflow): ${leftOut.map(quoteName).join('; ')}`,
        ]),
    '',
    '<details>',
    '<summary>Rulings (gzip+base64url)</summary>',
    '',
    '```',
    ...lines,
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
}

/** Looks the names up, asks Scryfall for the rulings of each card found and writes the comment; `digest` is the sha256 of the description the names came from. */
export async function fetchRulings(
  names: readonly string[],
  digest: string | null,
  deps: FetchDeps,
): Promise<RulingsResult> {
  const queue = createRequestQueue({
    fetch: deps.fetch,
    now: deps.now,
    sleep: deps.sleep,
    userAgent: deps.userAgent,
  });
  const client = createScryfallClient({ ...deps, queue });
  const resolved = await client.resolveNames(names);
  const records: CardRulings[] = [];
  const notFetched: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const card = resolved.found.get(normalizeNameKey(name));
    if (card === undefined) {
      notFetched.push(name);
      continue;
    }
    if (seen.has(card.scryfallId)) continue;
    seen.add(card.scryfallId);
    const answer = await queue.request({
      url: `https://api.scryfall.com/cards/${encodeURIComponent(card.scryfallId)}/rulings`,
    });
    const rulings = answer.kind === 'response' && answer.ok ? parseRulings(answer.json) : null;
    if (rulings === null) notFetched.push(card.name);
    else records.push({ name: card.name, rulings });
  }
  const problems: string[] = [];
  if (notFetched.length > 0) {
    problems.push(
      `the rulings of these cards were not fetched: ${notFetched.map(quoteName).join('; ')}`,
    );
  }
  if (records.length === 0) return { ok: false, comment: null, cards: 0, rulings: 0, problems };
  // A comment has a limit: cards are left out from the end until it fits, and the comment names them.
  const kept = [...records];
  const leftOut: string[] = [];
  let comment = commentOf(kept, digest, notFetched, leftOut);
  while (comment.length > MAX_COMMENT_LENGTH && kept.length > 1) {
    const last = kept.pop();
    if (last !== undefined) leftOut.unshift(last.name);
    comment = commentOf(kept, digest, notFetched, leftOut);
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      comment: null,
      cards: 0,
      rulings: 0,
      problems: [...problems, 'the rulings of one card are too long for a comment'],
    };
  }
  if (leftOut.length > 0) {
    problems.push(`left out for the length of a comment: ${leftOut.map(quoteName).join('; ')}`);
  }
  return {
    ok: true,
    comment,
    cards: kept.length,
    rulings: kept.reduce((n, r) => n + r.rulings.length, 0),
    problems,
  };
}

/** The rulings a comment carries, or why it cannot be used: not a rulings comment, fetched for another version of the description, or a payload that does not read. */
export function readRulingsComment(comment: string, digest: string): CardRulings[] | string {
  const text = comment.replace(/\r\n/g, '\n');
  if (!text.startsWith(RULINGS_COMMENT_MARKER)) return 'the comment is not a rulings comment';
  const marked = /^<!-- deck-support-rulings --><!-- sha256:([0-9a-f]{64}) -->/.exec(text);
  if (marked === null || marked[1] !== digest) {
    return 'the rulings were fetched for another version of the description';
  }
  const block = /```\n([A-Za-z0-9_-]+(?:\n[A-Za-z0-9_-]+)*)\n```/.exec(text);
  if (block === null) return 'the comment has no rulings block';
  let parsed: unknown;
  try {
    const bytes = gunzipSync(Buffer.from((block[1] ?? '').replace(/\n/g, ''), 'base64url'));
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return 'the rulings block does not decompress';
  }
  if (!Array.isArray(parsed)) return 'the rulings block is not a list';
  const records: CardRulings[] = [];
  for (const entry of parsed) {
    const e = entry as { name?: unknown; rulings?: unknown };
    if (typeof e.name !== 'string' || !Array.isArray(e.rulings))
      return 'a rulings record is malformed';
    const rulings: Ruling[] = [];
    for (const r of e.rulings) {
      const x = r as { date?: unknown; source?: unknown; text?: unknown };
      if (
        typeof x.date !== 'string' ||
        typeof x.source !== 'string' ||
        typeof x.text !== 'string'
      ) {
        return 'a ruling is malformed';
      }
      rulings.push({ date: x.date, source: x.source, text: x.text });
    }
    records.push({ name: e.name, rulings });
  }
  return records;
}

/** The rulings as a file to read during a build: one heading per card. */
export function rulingsMarkdown(records: readonly CardRulings[]): string {
  const parts = records.map((card) => {
    const body =
      card.rulings.length === 0
        ? 'No rulings on Scryfall.'
        : card.rulings.map((r) => `- ${r.date} (${r.source}): ${r.text}`).join('\n');
    return `## ${card.name}\n\n${body}`;
  });
  return `# Rulings (research only: do not commit)\n\n${parts.join('\n\n')}\n`;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** `pnpm corpus:fetch-rulings --body <file> --out <file> [--digest <sha256>]`: prints one JSON line; exit 0 written, 1 nothing to write, 2 bad usage. */
export async function mainFetch(
  argv: readonly string[],
  out: (text: string) => void,
  deps: FetchDeps,
): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { body: { type: 'string' }, out: { type: 'string' }, digest: { type: 'string' } },
  });
  if (values.body === undefined || values.out === undefined) {
    out(
      'usage: pnpm corpus:fetch-rulings --body <file with the issue description> --out <file for the comment> [--digest <sha256 of the description>]',
    );
    return 2;
  }
  if (values.digest !== undefined && !/^[0-9a-f]{64}$/.test(values.digest)) {
    out('usage: --digest is the 64 hex digits of a sha256');
    return 2;
  }
  const names = checkIssue(await readFile(values.body, 'utf8')).unsupported;
  if (names.length === 0) {
    out(
      JSON.stringify({
        ok: false,
        cards: 0,
        rulings: 0,
        problems: ['the description names no unsupported card'],
      }),
    );
    return 1;
  }
  const fetched = await fetchRulings(names, values.digest ?? null, deps);
  if (fetched.comment !== null) await writeFile(values.out, fetched.comment);
  out(
    JSON.stringify({
      ok: fetched.ok,
      cards: fetched.cards,
      rulings: fetched.rulings,
      problems: fetched.problems,
    }),
  );
  return fetched.ok ? 0 : 1;
}

/**
 * `pnpm corpus:rulings-from-comment --comment <file> --body <file> [--out <file>]`: checks that the comment was fetched for this description and writes
 * the rulings as Markdown, by default to a file of the temporary folder. Exit 0 written, 1 the comment cannot be used, 2 bad usage (a path in the repository).
 */
export async function mainRead(
  argv: readonly string[],
  out: (text: string) => void,
): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { comment: { type: 'string' }, body: { type: 'string' }, out: { type: 'string' } },
  });
  if (values.comment === undefined || values.body === undefined) {
    out(
      'usage: pnpm corpus:rulings-from-comment --comment <file with the rulings comment> --body <file with the issue description> [--out <file outside the repository>]',
    );
    return 2;
  }
  const digest = sha256(await readFile(values.body, 'utf8'));
  const target = path.resolve(
    values.out ?? path.join(tmpdir(), `deck-support-rulings-${digest.slice(0, 12)}.md`),
  );
  const inRepo = !path.relative(REPO_ROOT, target).startsWith('..');
  if (inRepo) {
    out('usage: --out must be outside the repository: rulings are research, never committed');
    return 2;
  }
  const records = readRulingsComment(await readFile(values.comment, 'utf8'), digest);
  if (typeof records === 'string') {
    out(JSON.stringify({ ok: false, problems: [records] }));
    return 1;
  }
  await writeFile(target, rulingsMarkdown(records));
  out(JSON.stringify({ ok: true, cards: records.length, file: target }));
  return 0;
}
