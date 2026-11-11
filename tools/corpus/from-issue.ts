// `pnpm corpus:from-issue --body <file> --issue <number>`: adds the cards of a support issue to the golden corpus (D-245). The import
// screen's "Ask for support on GitHub" button writes the deck's unsupported cards into the issue's description as golden records, as the
// player's browser received them from Scryfall, gzip-compressed in base64url. This command reads that block from the description (saved
// to a file), decompresses it, checks every record and merges the cards into golden.jsonl like `corpus:extract`, as acceptance cards
// whose source names the issue. No network and no bulk file: the owner does not run `corpus:extract` for these cards.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  cardDataPayload,
  goldenLine,
  ISSUE_CARD_SOURCE,
  parseCardDataText,
  parseGolden,
} from '@commander-arena/cards';
import type { Options } from './args.ts';
import { DEFAULT_GOLDEN, type ExtractIo, mergeGolden } from './extract.ts';

/** The cards of an issue description, each marked as coming from that issue; throws when the block is missing or damaged. */
export function cardsOfIssue(description: string, issue: number): ReturnType<typeof parseGolden> {
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
    source: `${ISSUE_CARD_SOURCE}, issue #${issue}`,
    acceptance: true as const,
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
    fresh = cardsOfIssue(await readFile(path.resolve(options.body), 'utf8'), options.issue);
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
  const { merged, replaced } = mergeGolden(existing, fresh);
  await writeFile(goldenFile, `${merged.map(goldenLine).join('\n')}\n`);
  io.out(
    `wrote ${path.relative(process.cwd(), goldenFile) || goldenFile}: ${fresh.length} card(s) from issue #${options.issue}` +
      ` (${fresh.length - replaced} new, ${replaced} replaced), ${merged.length} in all.`,
  );
  io.out(`cards: ${fresh.map((c) => c.name).join('; ')}`);
  return 0;
}
