// `pnpm corpus:extract --file <oracle_cards> --names <file>`: copies real cards from the Scryfall
// bulk file into the golden corpus (packages/cards/test/fixtures/corpus/golden.jsonl, D-066). The
// owner runs it where Scryfall is reachable; the result is committed. The names file lists one card
// name per line. A name is matched exactly (curly quotes and case do not matter) against the card
// name and the names of its faces. Only Commander-legal (or restricted) cards are taken, so an
// art-series print or a token with the same name is skipped. A card that is already in the golden
// file, by oracle id or by name when the entry has no id, is replaced by the fresh data, so a
// hand-written entry is superseded by the real one.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  goldenLine,
  normalizeNameKey,
  parseGolden,
  parseStoredCard,
  toGoldenCard,
} from '@commander-arena/cards';
import type { Options } from './args.ts';
import { readCardObjects } from './read-cards.ts';

export interface ExtractIo {
  out(text: string): void;
  err(text: string): void;
}

/** The names of a names file: trimmed, blank lines and `#` comments dropped, duplicates once. */
export function parseNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split('\n')) {
    const name = raw.replace(/#.*$/, '').trim();
    if (name !== '' && !names.includes(name)) names.push(name);
  }
  return names;
}

export const DEFAULT_GOLDEN = 'packages/cards/test/fixtures/corpus/golden.jsonl';

type Golden = ReturnType<typeof parseGolden>[number];

/**
 * The golden file with fresh cards added: a card already there (same oracle id, or the same name when the old entry has no id) is
 * replaced, so a hand-written entry gives way to real data. Shared by `corpus:extract` and `corpus:from-issue`.
 */
export function mergeGolden(
  existing: readonly Golden[],
  fresh: readonly Golden[],
): { merged: Golden[]; replaced: number } {
  const freshIds = new Set(fresh.map((c) => c.oracleId));
  const freshNames = new Set(fresh.map((c) => normalizeNameKey(c.name)));
  const kept = existing.filter((c) =>
    c.oracleId === null ? !freshNames.has(normalizeNameKey(c.name)) : !freshIds.has(c.oracleId),
  );
  return { merged: [...kept, ...fresh], replaced: existing.length - kept.length };
}

/** Runs the command: 0 when every name was found, 1 when some were not (the rest is written), 2 on bad input. */
export async function extract(options: Options, repoRoot: string, io: ExtractIo): Promise<number> {
  if (options.file === undefined || options.names === undefined) {
    io.err('error: extract needs --file and --names');
    return 2;
  }
  let wanted: string[];
  try {
    wanted = parseNames(await readFile(path.resolve(options.names), 'utf8'));
  } catch (error) {
    io.err(
      `error: cannot read ${options.names}: ${error instanceof Error ? error.message : error}`,
    );
    return 2;
  }
  if (wanted.length === 0) {
    io.err('error: the names file lists no card');
    return 2;
  }
  const goldenFile = path.resolve(options.golden ?? path.join(repoRoot, DEFAULT_GOLDEN));
  let existing: ReturnType<typeof parseGolden> = [];
  try {
    existing = parseGolden(await readFile(goldenFile, 'utf8'));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') {
      io.err(`error: cannot read ${goldenFile}: ${error instanceof Error ? error.message : error}`);
      return 2;
    }
  }

  const keys = new Map(wanted.map((name) => [normalizeNameKey(name), name] as const));
  const found = new Map<string, ReturnType<typeof toGoldenCard>>();
  const source = `scryfall-bulk ${path.basename(options.file)}`;
  try {
    for await (const item of readCardObjects(path.resolve(options.file))) {
      if (item.kind === 'bad') continue;
      const converted = parseStoredCard(item.value, 0);
      if (converted.card === null) continue;
      const card = converted.card;
      // The same filter as the coverage run: art-series prints, tokens and other non-playable
      // objects share a name with the real card and must not be the entry that gets extracted.
      if (card.commanderLegality !== 'legal' && card.commanderLegality !== 'restricted') continue;
      const names = [card.name, ...card.faces.map((f) => f.name)];
      const hit = names.map(normalizeNameKey).find((key) => keys.has(key));
      if (hit === undefined || found.has(hit)) continue;
      found.set(hit, toGoldenCard(card, source, { acceptance: options.acceptance }));
    }
  } catch (error) {
    io.err(`error: cannot read ${options.file}: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const fresh = [...found.values()];
  const { merged, replaced } = mergeGolden(existing, fresh);
  await writeFile(goldenFile, `${merged.map(goldenLine).join('\n')}\n`);

  const missing = wanted.filter((name) => !found.has(normalizeNameKey(name)));
  io.out(
    `wrote ${path.relative(process.cwd(), goldenFile) || goldenFile}: ${fresh.length} card(s) from the bulk file` +
      ` (${fresh.length - replaced} new, ${replaced} replaced), ${merged.length} in all.`,
  );
  if (missing.length > 0) {
    io.err(`not found in the bulk file (${missing.length}): ${missing.join('; ')}`);
    return 1;
  }
  return 0;
}
