import { readdir, readFile } from 'node:fs/promises';
import {
  createRequestQueue,
  fromGoldenCard,
  fromSnapshotCard,
  importCard,
  parseGolden,
  parsePreconSnapshot,
  tokenSearchQuery,
} from '@commander-arena/cards';
import { type Effect, TOKEN_PRESETS, type TokenDefinition } from '@commander-arena/engine';

/** Walks nested token abilities too. Runtime-dependent copies and P/T are reported, not guessed. */
export function tokenQueries(value: unknown): { queries: string[]; dynamic: number } {
  const queries = new Set<string>();
  let dynamic = 0;
  const add = (token: TokenDefinition) => {
    const query = tokenSearchQuery(token);
    if (query !== null) queries.add(query);
  };
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    if ('kind' in node && node.kind === 'createToken') {
      const effect = node as Extract<Effect, { kind: 'createToken' }>;
      if (effect.token.kind === 'preset') add(TOKEN_PRESETS[effect.token.preset]);
      else if (effect.token.kind === 'custom' && effect.token.ptAmount === undefined) {
        add(effect.token.definition);
      } else dynamic++;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(value);
  return { queries: [...queries].sort(), dynamic };
}

/** Runner-only audit; --dry-run lists the same queries without contacting Scryfall. */
export async function auditTokenArt(dryRun: boolean): Promise<void> {
  const root = new URL('../../', import.meta.url);
  const golden = parseGolden(
    await readFile(new URL('packages/cards/test/fixtures/corpus/golden.jsonl', root), 'utf8'),
  );
  const cards = golden.map(fromGoldenCard);
  const snapshots = new URL('apps/web/src/precons/snapshots/', root);
  for (const file of (await readdir(snapshots)).filter((f) => f.endsWith('.json')).sort()) {
    const parsed = parsePreconSnapshot(
      JSON.parse(await readFile(new URL(file, snapshots), 'utf8')),
    );
    if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
    cards.push(...parsed.snapshot.cards.map(fromSnapshotCard));
  }
  const definitions = cards.map((card) => importCard(card).definition);
  // Presets are also created indirectly (for example by investigate).
  const presets = Object.values(TOKEN_PRESETS).map((definition) => ({
    kind: 'createToken',
    token: { kind: 'custom', definition },
  }));
  const { queries, dynamic } = tokenQueries([definitions, presets]);
  console.log(
    JSON.stringify({ tokenKinds: queries.length, runtimeDependentEffects: dynamic, dryRun }),
  );
  const queue = createRequestQueue({
    fetch,
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    userAgent: 'commander-arena-token-art/1',
  });
  for (const query of queries) {
    if (dryRun) {
      console.log(query);
      continue;
    }
    const response = await queue.request({
      url: `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`,
    });
    const body = response.kind === 'response' ? response.json : undefined;
    const total =
      response.kind === 'response' && response.status === 404
        ? 0
        : typeof body === 'object' && body !== null && 'total_cards' in body
          ? body.total_cards
          : null;
    console.log(JSON.stringify({ query, total, fallback: total !== 1 }));
    if (total === null) throw new Error('Scryfall audit request failed; see the preceding query');
  }
}
