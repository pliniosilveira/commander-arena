// `pnpm corpus:fetch-card-data --body <file> --out <file> [--digest <sha256>]`: the card data of a "deck support" issue that has none of its own (D-290). The
// deck support workflow runs it on a runner, which can reach Scryfall (the cloud session of the coding agent cannot, D-245): the names of the unsupported cards
// that `corpus:check-issue` reads from the description are looked up through the app's own Scryfall client (rate limits, retries, the melded faces of meld
// cards) and written as the comment the workflow posts, in the block format of the app (`cardDataBlock`), so `corpus:from-issue --fetched` reads it as it reads
// a description. The data is Scryfall's, not the author's: a name that Scryfall does not find exactly, or finds only by a fuzzy match, is a problem, never a guess.
// Prints one JSON line `{ ok, count, problems }`; exit 0 when the comment was written, 1 when the cards could not be had, 2 on bad usage.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import {
  CARD_DATA_COMMENT_MARKER,
  cardDataBlock,
  cardDataText,
  createScryfallClient,
  type GoldenCard,
  normalizeNameKey,
  type ScryfallFetch,
  toGoldenCard,
  WORKFLOW_CARD_SOURCE,
} from '@commander-arena/cards';
import { checkIssue, quoteName } from './check-issue.ts';

/** GitHub takes a comment of at most 65,536 characters; the block is kept well under it. */
export const MAX_COMMENT_LENGTH = 60000;

export interface FetchDeps {
  readonly fetch: ScryfallFetch;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Scryfall asks every client to say who it is. */
  readonly userAgent: string;
}

export interface FetchResult {
  readonly ok: boolean;
  /** The text of the comment, or null when the cards could not be had. */
  readonly comment: string | null;
  readonly count: number;
  readonly problems: readonly string[];
}

/** Looks the names up and writes the comment; `digest` is the sha256 of the description the names were read from, so the agent can tell the data is not stale. */
export async function fetchCardData(
  names: readonly string[],
  digest: string | null,
  deps: FetchDeps,
): Promise<FetchResult> {
  const client = createScryfallClient({
    fetch: deps.fetch,
    now: deps.now,
    sleep: deps.sleep,
    userAgent: deps.userAgent,
  });
  const result = await client.resolveNames(names);
  const problems: string[] = [];
  const records = new Map<string, GoldenCard>();
  const related = new Map<string, GoldenCard>();
  for (const name of names) {
    const card = result.found.get(normalizeNameKey(name));
    if (card === undefined) continue;
    records.set(card.oracleId, toGoldenCard(card, WORKFLOW_CARD_SOURCE, { acceptance: true }));
  }
  if (result.notFound.length > 0) {
    problems.push(
      `Scryfall has no card of these names: ${result.notFound.map(quoteName).join('; ')}`,
    );
  }
  if (result.fuzzy.length > 0) {
    problems.push(
      `Scryfall finds only a similar card, not the exact name, for: ${result.fuzzy
        .map((f) => `${quoteName(f.requested)} (${quoteName(f.candidate.name)}?)`)
        .join('; ')}`,
    );
  }
  if (result.failures.length > 0) {
    problems.push(
      `Scryfall could not be asked about: ${result.failures
        .map((f) => `${quoteName(f.requested)} (${f.message})`)
        .join('; ')}`,
    );
  }
  // D-280: the melded face of a meld card is a card of its own that the work needs; it is kept as `related`, no card of the deck.
  for (const [key, entry] of result.related ?? []) {
    if (entry.kind === 'card') {
      related.set(
        entry.card.oracleId,
        toGoldenCard(entry.card, WORKFLOW_CARD_SOURCE, { related: true }),
      );
    } else {
      problems.push(`the melded face "${key}" could not be had: ${entry.message}`);
    }
  }
  if (problems.length > 0) return { ok: false, comment: null, count: 0, problems };
  const all = [
    ...records.values(),
    ...[...related.values()].filter((r) => !records.has(r.oracleId ?? '')),
  ];
  const payload = gzipSync(cardDataText(all)).toString('base64url');
  const comment = [
    CARD_DATA_COMMENT_MARKER + (digest === null ? '' : `<!-- sha256:${digest} -->`),
    `The card data of the ${records.size} unsupported card(s) of this issue, fetched from Scryfall by the deck support workflow (the description carried none, or none that could be used). It is read by the deck support agent; nothing in it comes from the issue's author.`,
    '',
    cardDataBlock(payload, all.length),
  ].join('\n');
  if (comment.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      comment: null,
      count: 0,
      problems: [`the card data of ${records.size} card(s) is too long for a comment`],
    };
  }
  return { ok: true, comment, count: all.length, problems: [] };
}

/** The command line: reads the description, fetches what `corpus:check-issue` says is needed, writes the comment, returns the exit code. */
export async function main(
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
      'usage: node tools/corpus/fetch-card-data.ts --body <file with the issue description> --out <file for the comment> [--digest <sha256 of the description>]',
    );
    return 2;
  }
  if (values.digest !== undefined && !/^[0-9a-f]{64}$/.test(values.digest)) {
    out('usage: --digest is the 64 hex digits of a sha256');
    return 2;
  }
  const check = checkIssue(await readFile(values.body, 'utf8'));
  if (!check.needsCardData) {
    out(
      JSON.stringify({
        ok: false,
        count: 0,
        problems: ['the request does not need card data from Scryfall: nothing was fetched'],
      }),
    );
    return 1;
  }
  const fetched = await fetchCardData(check.unsupported, values.digest ?? null, deps);
  if (fetched.comment !== null) await writeFile(values.out, fetched.comment);
  out(JSON.stringify({ ok: fetched.ok, count: fetched.count, problems: fetched.problems }));
  return fetched.ok ? 0 : 1;
}
