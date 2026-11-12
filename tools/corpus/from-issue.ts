// `pnpm corpus:from-issue --body <file> --issue <number>`: adds the cards of a support issue to the golden corpus (D-245). The import
// screen's "Ask for support on GitHub" button writes the deck's unsupported cards into the issue's description as golden records, as the
// player's browser received them from Scryfall, gzip-compressed in base64url. This command reads that block from the description (saved
// to a file), decompresses it, checks every record and merges the cards into golden.jsonl like `corpus:extract`, as acceptance cards
// whose source names the issue. No network and no bulk file: the owner does not run `corpus:extract` for these cards.
// `--no-replace` is for an issue of someone else (D-251): cards already in the file are kept, and different data for one stops the command.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  cardDataPayload,
  goldenLine,
  ISSUE_CARD_SOURCE,
  parseCardDataText,
  parseGolden,
  WORKFLOW_CARD_SOURCE,
} from '@commander-arena/cards';
import type { Options } from './args.ts';
import { DEFAULT_GOLDEN, type ExtractIo, mergeGolden } from './extract.ts';

/** The cards of an issue description, each marked as coming from that issue; throws when the block is missing or damaged. */
export function cardsOfIssue(
  description: string,
  issue: number,
  fetched = false,
): ReturnType<typeof parseGolden> {
  const payload = cardDataPayload(description);
  if (payload === null)
    throw new Error('the description has no "Card data for the golden corpus" block');
  let text: string;
  try {
    text = gunzipSync(Buffer.from(payload, 'base64url')).toString('utf8');
  } catch (error) {
    throw new Error(
      `the card data does not decompress: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseCardDataText(text).map((card) => ({
    ...card,
    // D-290: the caller says where the text came from, never the record (an issue's author could write any `source` in a block of the description).
    source: `${fetched ? WORKFLOW_CARD_SOURCE : ISSUE_CARD_SOURCE}, issue #${issue}`,
    // D-280: the melded face of a pair is kept as `related` (no card of the deck, no acceptance card), the others are acceptance cards.
    ...(card.related === true ? {} : { acceptance: true as const }),
  }));
}

/** Runs the command: 0 when the cards were added, 2 on bad input (nothing is written then). */
export async function fromIssue(
  options: Options,
  repoRoot: string,
  io: ExtractIo,
): Promise<number> {
  if (options.body === undefined || options.issue === undefined) {
    io.err('error: from-issue needs --body and --issue');
    return 2;
  }
  let fresh: ReturnType<typeof parseGolden>;
  try {
    fresh = cardsOfIssue(
      await readFile(path.resolve(options.body), 'utf8'),
      options.issue,
      options.fetched,
    );
  } catch (error) {
    io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (fresh.length === 0) {
    io.err('error: the card data block lists no card');
    return 2;
  }
  const goldenFile = path.resolve(options.golden ?? path.join(repoRoot, DEFAULT_GOLDEN));
  let existing: ReturnType<typeof parseGolden> = [];
  try {
    existing = parseGolden(await readFile(goldenFile, 'utf8'));
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      io.err(`error: cannot read ${goldenFile}: ${error instanceof Error ? error.message : error}`);
      return 2;
    }
  }
  if (options.noReplace) {
    // An issue of someone else (D-251): the corpus holds real data, so a card that is already there is never replaced.
    const conflicts: string[] = [];
    const known = new Map(existing.map((c) => [c.oracleId, c]));
    fresh = fresh.filter((card) => {
      const there = known.get(card.oracleId);
      if (there === undefined) return true;
      if (JSON.stringify(there.faces) !== JSON.stringify(card.faces)) conflicts.push(card.name);
      return false;
    });
    if (conflicts.length > 0) {
      io.err(
        `error: the issue has different data for card(s) the corpus already holds, so nothing was written: ${conflicts.join('; ')}`,
      );
      return 2;
    }
    if (fresh.length === 0) {
      io.out('every card of the issue is already in the corpus: nothing to add.');
      return 0;
    }
  }
  const { merged, replaced } = mergeGolden(existing, fresh);
  await writeFile(goldenFile, `${merged.map(goldenLine).join('\n')}\n`);
  io.out(
    `wrote ${path.relative(process.cwd(), goldenFile) || goldenFile}: ${fresh.length} card(s) from issue #${options.issue}` +
      ` (${fresh.length - replaced} new, ${replaced} replaced), ${merged.length} in all.`,
  );
  io.out(`cards: ${fresh.map((c) => c.name).join('; ')}`);
  return 0;
}
