/**
 * Meld in the import (D-280, CR 701.42, 712.5): the combined face of a pair is a card of its own that the deck does not name, which the client fetches with the pair (`ResolveResult.related`).
 * The service reads a meld card with it, never takes the support of a meld card from the cache, and a deck-support issue carries the face of every unsupported meld card as a `related` record.
 * Every card is SYNTHETIC (Scryfall's shape, invented names and text); the component names `meld_part` and `meld_result` are UNVERIFIED against the real Scryfall data.
 */
import {
  cardDataPayload,
  MemorySupportCache,
  parseCardDataText,
  parseStoredCard,
  type RelatedCard,
  type ResolveResult,
  type ScryfallClient,
  type StoredCard,
} from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import { deckIssueBody } from '../src/import/deck-issue';
import { createImportService } from '../src/import/service';
import type { VersionInfo } from '../src/version';

const FRONT = 'SYNTHETIC Dusk Squire';
const BACK = 'SYNTHETIC Dawn Squire';
const RESULT = 'SYNTHETIC Twilight Titan';
const VERSION: VersionInfo = { commit: 'abc1234', date: '2026-11-10', engine: 78, parser: 84 };

const part = (name: string, component: string) => ({ object: 'related_card', component, name });
const PARTS = [part(FRONT, 'meld_part'), part(BACK, 'meld_part'), part(RESULT, 'meld_result')];

function stored(raw: Record<string, unknown>): StoredCard {
  const converted = parseStoredCard(
    {
      object: 'card',
      id: `synthetic-id-${String(raw.name)}`,
      oracle_id: `synthetic-oracle-${String(raw.name)}`,
      cmc: 0,
      keywords: [],
      legalities: { commander: 'legal' },
      color_identity: [],
      all_parts: PARTS,
      ...raw,
    },
    0,
  );
  if (converted.card === null) throw new Error('unreadable synthetic card');
  return converted.card;
}

const front = stored({
  name: FRONT,
  layout: 'meld',
  mana_cost: '{2}{W}',
  type_line: 'Creature — Human Knight',
  oracle_text: `Vigilance\nAt the beginning of your end step, if you both own and control ${FRONT} and a creature named ${BACK}, exile them, then meld them into ${RESULT}.`,
  power: '2',
  toughness: '2',
  colors: ['W'],
  color_identity: ['W'],
});
const back = stored({
  name: BACK,
  layout: 'meld',
  mana_cost: '{1}{B}',
  type_line: 'Creature — Human Cleric',
  oracle_text: `(Melds with ${FRONT}.)`,
  power: '1',
  toughness: '3',
  colors: ['B'],
  color_identity: ['B'],
});
const face = (oracleText: string) =>
  stored({
    name: RESULT,
    layout: 'normal',
    mana_cost: '',
    type_line: 'Legendary Creature — Giant',
    oracle_text: oracleText,
    power: '8',
    toughness: '8',
    colors: ['W', 'B'],
    color_identity: ['W', 'B'],
  });

const LIST = `Commander\n1x ${FRONT}\n\nMainboard\n1x ${BACK}\n`;

/** A client that has the two halves and, when `related` says so, the melded face. */
function client(related: ReadonlyMap<string, RelatedCard> | undefined): ScryfallClient {
  return {
    async resolveNames(names): Promise<ResolveResult> {
      const found = new Map<string, StoredCard>();
      for (const name of names) {
        const card = [front, back].find((c) => c.name === name);
        if (card !== undefined) found.set(name.toLowerCase(), card);
      }
      return { found, notFound: [], fuzzy: [], failures: [], ...(related ? { related } : {}) };
    },
  };
}

const have = (card: StoredCard): ReadonlyMap<string, RelatedCard> =>
  new Map([[RESULT.toLowerCase(), { kind: 'card' as const, card }]]);

describe('the import of a meld pair', () => {
  test('with the melded face the client fetched, both halves are supported', async () => {
    const service = createImportService({
      client: client(have(face('Flying'))),
      supportCache: new MemorySupportCache(),
    });
    const report = await service.run({ text: LIST, deckName: 'd' });
    expect(report.coverage.unsupported).toEqual([]);
    expect(report.entries.map((e) => e.card.support.status)).toEqual(['supported', 'supported']);
    expect(report.entries[0]?.card.definition.faces.map((f) => f.name)).toEqual([FRONT, RESULT]);
    expect(report.meldFaces?.map((c) => c.name)).toEqual([RESULT]);
  });

  test('with no melded face from the client they are unsupported, with the reason', async () => {
    const service = createImportService({
      client: client(undefined),
      supportCache: new MemorySupportCache(),
    });
    const report = await service.run({ text: LIST, deckName: 'd' });
    expect(report.coverage.unsupported).toHaveLength(2);
    expect(report.entries[0]?.card.support.reasons[0]).toMatch(/melded face .* was not available/);
    expect(report.meldFaces).toBeUndefined();
  });

  test('a face the client could not get says why', async () => {
    const missing = new Map<string, RelatedCard>([
      [RESULT.toLowerCase(), { kind: 'missing', message: 'HTTP 503' }],
    ]);
    const service = createImportService({
      client: client(missing),
      supportCache: new MemorySupportCache(),
    });
    const report = await service.run({ text: LIST, deckName: 'd' });
    expect(report.entries[0]?.card.support.reasons[0]).toMatch(/could not be fetched: HTTP 503/);
  });

  test('the support of a meld card is never kept: a bad day does not make the card unsupported for good', async () => {
    const supportCache = new MemorySupportCache();
    const bad = createImportService({ client: client(undefined), supportCache });
    expect((await bad.run({ text: LIST, deckName: 'd' })).coverage.unsupported).toHaveLength(2);
    expect(await supportCache.get(front.oracleId)).toBeUndefined();
    const good = createImportService({ client: client(have(face('Flying'))), supportCache });
    expect((await good.run({ text: LIST, deckName: 'd' })).coverage.unsupported).toEqual([]);
  });

  test('a melded face with a line nobody reads makes both halves unsupported', async () => {
    const service = createImportService({
      client: client(have(face('Flying\nSynthetic gibberish that no rule reads.'))),
      supportCache: new MemorySupportCache(),
    });
    const report = await service.run({ text: LIST, deckName: 'd' });
    expect(report.coverage.unsupported).toHaveLength(2);
    expect(report.entries[0]?.card.support.unparsed[0]?.face).toBe(1);
  });
});

describe('the deck-support issue of a meld pair', () => {
  async function recordsOf(text: string) {
    const service = createImportService({
      client: client(have(face('Flying\nSynthetic gibberish that no rule reads.'))),
      supportCache: new MemorySupportCache(),
    });
    const report = await service.run({ text: LIST, deckName: 'd' });
    const body = await deckIssueBody(report, VERSION);
    const payload = cardDataPayload(body);
    if (payload === null) return { body, records: [] };
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return { body, records: parseCardDataText(await new Response(stream).text()), text };
  }

  test('carries the melded face as a related record beside the two cards, with the parts of each half', async () => {
    const { body, records } = await recordsOf(LIST);
    expect(body).toContain('(3 card(s), gzip+base64url)');
    expect(
      records
        .map((r) => [r.name, r.acceptance === true, r.related === true] as const)
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    ).toEqual([
      [BACK, true, false],
      [FRONT, true, false],
      [RESULT, false, true],
    ]);
    expect(records.find((r) => r.name === FRONT)?.relatedParts).toEqual(
      PARTS.map((p) => ({ name: p.name, component: p.component })),
    );
  });
});
