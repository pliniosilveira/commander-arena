import { describe, expect, test } from 'vitest';
import { createScryfallClient, MemoryCardCache, type ScryfallFetch } from '../src/scryfall';
import {
  createFakeClock,
  createFakeFetch,
  emulateScryfall,
  type Handler,
  jsonResponse,
  numberedCards,
  type RawCard,
  type ScryfallEmulation,
  syntheticCard,
  syntheticDoubleFaced,
  syntheticSplit,
} from './scryfall-helpers';

// Every response here is SYNTHETIC (see scryfall-helpers.ts); the emulator follows the shapes
// found live in D-048.

const HOUR = 60 * 60 * 1000;

function setup(
  handler: Handler,
  options: { cache?: boolean; ttlMs?: number; userAgent?: string } = {},
) {
  const clock = createFakeClock();
  const http = createFakeFetch(clock, handler);
  const cache = options.cache
    ? new MemoryCardCache({ now: clock.now, ttlMs: options.ttlMs })
    : undefined;
  const client = createScryfallClient({
    fetch: http.fetch as ScryfallFetch,
    now: clock.now,
    sleep: clock.sleep,
    cache,
    userAgent: options.userAgent,
  });
  return { clock, http, client, cache };
}

function withCards(emulation: ScryfallEmulation, options: Parameters<typeof setup>[1] = {}) {
  return setup(emulateScryfall(emulation), options);
}

const posts = <T extends { method: string }>(calls: T[]): T[] =>
  calls.filter((call) => call.method === 'POST');
const identifiersOf = (call: { body?: unknown } | undefined): { name: string }[] => {
  const body = call?.body as { identifiers: { name: string }[] } | undefined;
  return body?.identifiers ?? [];
};

describe('batching (75 identifiers per /cards/collection request)', () => {
  test.each([
    [1, [1]],
    [75, [75]],
    [76, [75, 1]],
    [150, [75, 75]],
    [151, [75, 75, 1]],
  ])('%i names go out in batches %j', async (count, sizes) => {
    const cards = numberedCards(count);
    const { clock, http, client } = withCards({ cards });
    const result = await clock.run(client.resolveNames(cards.map((card) => String(card.name))));
    const batches = posts(http.calls);
    expect(batches.map((call) => identifiersOf(call).length)).toEqual(sizes);
    expect(http.calls).toHaveLength(sizes.length); // no fallbacks needed
    expect(result.found.size).toBe(count);
    expect(result.notFound).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  test('batches are spaced 500 ms apart', async () => {
    const cards = numberedCards(150);
    const { clock, http, client } = withCards({ cards });
    await clock.run(client.resolveNames(cards.map((card) => String(card.name))));
    expect(http.calls).toHaveLength(2);
    expect((http.calls[1]?.at ?? 0) - (http.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(500);
  });

  test('duplicate names are asked once, in any spelling', async () => {
    const { clock, http, client } = withCards({ cards: [syntheticCard('Synthetic Bear')] });
    const result = await clock.run(
      client.resolveNames(['Synthetic Bear', 'synthetic bear', '  Synthetic   Bear ']),
    );
    expect(identifiersOf(http.calls[0])).toEqual([{ name: 'Synthetic Bear' }]);
    expect([...result.found.keys()]).toEqual(['synthetic bear']);
  });

  test('found is keyed by the normalized requested name', async () => {
    const { clock, client } = withCards({ cards: [syntheticCard("Synthetic Bear's Den")] });
    const result = await clock.run(client.resolveNames(['Synthetic Bear’s  Den']));
    expect([...result.found.keys()]).toEqual(["synthetic bear's den"]);
    expect(result.found.get("synthetic bear's den")?.name).toBe("Synthetic Bear's Den");
  });

  test('an empty list makes no request', async () => {
    const { clock, http, client } = withCards({ cards: [] });
    const result = await clock.run(client.resolveNames([]));
    expect(http.calls).toEqual([]);
    expect(result.found.size).toBe(0);
  });
});

describe('multi-faced names (D-048)', () => {
  const cards = [
    syntheticDoubleFaced('Synthetic Front', 'Synthetic Back'),
    syntheticSplit('Synthetic Left', 'Synthetic Right'),
    syntheticCard('Synthetic Bear'),
  ];

  test('only the front-face name is sent for an A // B name', async () => {
    const { clock, http, client } = withCards({ cards });
    await clock.run(
      client.resolveNames([
        'Synthetic Front // Synthetic Back',
        'Synthetic Left // Synthetic Right',
        'Synthetic Bear',
      ]),
    );
    expect(identifiersOf(http.calls[0])).toEqual([
      { name: 'Synthetic Front' },
      { name: 'Synthetic Left' },
      { name: 'Synthetic Bear' },
    ]);
  });

  test('the result is keyed by the requested full name', async () => {
    const { clock, client } = withCards({ cards });
    const result = await clock.run(
      client.resolveNames([
        'Synthetic Front // Synthetic Back',
        'synthetic left // synthetic right',
      ]),
    );
    expect(result.found.get('synthetic front // synthetic back')?.layout).toBe('transform');
    expect(result.found.get('synthetic left // synthetic right')?.layout).toBe('split');
    expect(result.notFound).toEqual([]);
  });

  test('a front-face name alone and the full name find the same card with one identifier', async () => {
    const { clock, http, client } = withCards({ cards });
    const result = await clock.run(
      client.resolveNames(['Synthetic Front', 'Synthetic Front // Synthetic Back']),
    );
    expect(identifiersOf(http.calls[0])).toEqual([{ name: 'Synthetic Front' }]);
    expect(result.found.get('synthetic front')?.name).toBe('Synthetic Front // Synthetic Back');
    expect(result.found.get('synthetic front // synthetic back')?.name).toBe(
      'Synthetic Front // Synthetic Back',
    );
  });

  test('a separator written with one slash or without spaces is normalized too', async () => {
    const { clock, http, client } = withCards({ cards });
    const result = await clock.run(client.resolveNames(['Synthetic Front / Synthetic Back']));
    expect(identifiersOf(http.calls[0])).toEqual([{ name: 'Synthetic Front' }]);
    expect(result.found.has('synthetic front // synthetic back')).toBe(true);
  });

  test('the named fallback also sends the front face only', async () => {
    const hidden = syntheticDoubleFaced('Synthetic Hidden', 'Synthetic Other');
    const { clock, http, client } = withCards({
      cards: [],
      exactOnly: { 'synthetic hidden': hidden },
    });
    const result = await clock.run(client.resolveNames(['Synthetic Hidden // Synthetic Other']));
    const named = http.calls.find((call) => call.url.includes('/cards/named'));
    expect(new URL(named?.url ?? '').searchParams.get('exact')).toBe('Synthetic Hidden');
    expect(result.found.get('synthetic hidden // synthetic other')?.oracleId).toBe(
      hidden.oracle_id,
    );
  });
});

describe('matching by name, not by position', () => {
  const cards = ['Synthetic One', 'Synthetic Two', 'Synthetic Three', 'Synthetic Four'].map(
    (name) => syntheticCard(name),
  );
  const names = cards.map((card) => String(card.name));

  test('a response in another order still maps every card to its request', async () => {
    const { clock, client } = withCards({ cards, reverse: true });
    const result = await clock.run(client.resolveNames(names));
    for (const name of names) {
      expect(result.found.get(name.toLowerCase())?.name).toBe(name);
    }
  });

  test('a card missing from the answer is recovered by name, the others are matched', async () => {
    const { clock, http, client } = withCards({ cards, omit: ['synthetic two'] });
    const result = await clock.run(client.resolveNames(names));
    expect(result.found.size).toBe(4);
    expect(result.found.get('synthetic two')?.name).toBe('Synthetic Two');
    expect(result.found.get('synthetic three')?.name).toBe('Synthetic Three');
    expect(result.notFound).toEqual([]);
    const named = http.calls.filter((call) => call.url.includes('/cards/named'));
    expect(named).toHaveLength(1);
    expect(new URL(named[0]?.url ?? '').searchParams.get('exact')).toBe('Synthetic Two');
  });

  test('a missing card that Scryfall does not know is reported as not found', async () => {
    const { clock, client } = withCards({ cards });
    const result = await clock.run(client.resolveNames([...names, 'Synthetic Ghost']));
    expect(result.found.size).toBe(4);
    expect(result.notFound).toEqual(['Synthetic Ghost']);
  });

  test('a card nobody asked for is ignored', async () => {
    const stray = syntheticCard('Synthetic Stray');
    const handler: Handler = (call, index) =>
      call.method === 'POST'
        ? jsonResponse({ object: 'list', not_found: [], data: [stray, ...cards] })
        : emulateScryfall({ cards })(call, index);
    const { clock, client } = setup(handler);
    const result = await clock.run(client.resolveNames(['Synthetic One']));
    expect([...result.found.keys()]).toEqual(['synthetic one']);
  });
});

describe('not_found fallback: named exact, then fuzzy', () => {
  test('a name reported in not_found is retried with /cards/named?exact=', async () => {
    const odd = syntheticCard('Synthetic Odd');
    const { clock, http, client } = withCards({
      cards: [syntheticCard('Synthetic Bear')],
      exactOnly: { 'synthetic odd': odd },
    });
    const result = await clock.run(client.resolveNames(['Synthetic Bear', 'Synthetic Odd']));
    expect(result.found.get('synthetic odd')?.oracleId).toBe(odd.oracle_id);
    expect(result.fuzzy).toEqual([]);
    const named = http.calls.filter((call) => call.url.includes('/cards/named'));
    expect(named).toHaveLength(1);
    expect(named[0]?.method).toBe('GET');
    expect(new URL(named[0]?.url ?? '').searchParams.get('exact')).toBe('Synthetic Odd');
  });

  test('exact 404 goes on to fuzzy; a fuzzy hit is returned for confirmation, not found', async () => {
    const candidate = syntheticCard('Synthetic Beartrap');
    const { clock, http, client } = withCards({
      cards: [],
      fuzzy: { 'synthetic beartrp': candidate },
    });
    const result = await clock.run(client.resolveNames(['Synthetic Beartrp']));
    expect(result.found.size).toBe(0);
    expect(result.notFound).toEqual([]);
    expect(result.fuzzy).toHaveLength(1);
    expect(result.fuzzy[0]?.requested).toBe('Synthetic Beartrp');
    expect(result.fuzzy[0]?.candidate.name).toBe('Synthetic Beartrap');
    const queries = http.calls
      .filter((call) => call.url.includes('/cards/named'))
      .map((call) => [...new URL(call.url).searchParams.keys()][0]);
    expect(queries).toEqual(['exact', 'fuzzy']);
  });

  test('a fuzzy candidate is not cached under the requested name', async () => {
    const candidate = syntheticCard('Synthetic Beartrap');
    const { clock, client, cache } = withCards(
      { cards: [], fuzzy: { 'synthetic beartrp': candidate } },
      { cache: true },
    );
    await clock.run(client.resolveNames(['Synthetic Beartrp']));
    expect(await cache?.get('synthetic beartrp')).toBeUndefined();
  });

  test('a name nobody knows is not found after exact and fuzzy both say 404', async () => {
    const { clock, http, client } = withCards({ cards: [syntheticCard('Synthetic Bear')] });
    const result = await clock.run(client.resolveNames(['Synthetic Bear', 'Synthetic Nothing']));
    expect(result.notFound).toEqual(['Synthetic Nothing']);
    expect(result.found.size).toBe(1);
    expect(http.calls.filter((call) => call.url.includes('/cards/named'))).toHaveLength(2);
  });

  test('a 400 from named is a failure for that name, not a not-found', async () => {
    const base = emulateScryfall({ cards: [] });
    const { clock, client } = setup((call, index) =>
      call.url.includes('/cards/named')
        ? jsonResponse({ object: 'error', status: 400, details: 'Bad query.' }, 400)
        : base(call, index),
    );
    const result = await clock.run(client.resolveNames(['Synthetic Nothing']));
    expect(result.notFound).toEqual([]);
    expect(result.failures).toEqual([
      { requested: 'Synthetic Nothing', message: 'HTTP 400: Bad query.' },
    ]);
  });
});

describe('cache', () => {
  const cards = [
    syntheticCard('Synthetic Bear'),
    syntheticDoubleFaced('Synthetic Front', 'Synthetic Back'),
  ];

  test('a second lookup of the same names makes no request', async () => {
    const { clock, http, client } = withCards({ cards }, { cache: true });
    const first = await clock.run(
      client.resolveNames(['Synthetic Bear', 'Synthetic Front // Synthetic Back']),
    );
    const callsAfterFirst = http.calls.length;
    const second = await clock.run(
      client.resolveNames(['synthetic bear', 'Synthetic Front // Synthetic Back']),
    );
    expect(http.calls).toHaveLength(callsAfterFirst);
    expect([...second.found.keys()]).toEqual([...first.found.keys()]);
  });

  test('a face name and an oracle id are cached keys too', async () => {
    const { clock, http, client, cache } = withCards({ cards }, { cache: true });
    await clock.run(client.resolveNames(['Synthetic Front // Synthetic Back']));
    const calls = http.calls.length;
    const result = await clock.run(client.resolveNames(['Synthetic Back']));
    expect(http.calls).toHaveLength(calls);
    expect(result.found.get('synthetic back')?.layout).toBe('transform');
    expect(await cache?.get(String(cards[1]?.oracle_id))).toBeDefined();
  });

  test('only the missing names go to the network', async () => {
    const { clock, http, client } = withCards({ cards }, { cache: true });
    await clock.run(client.resolveNames(['Synthetic Bear']));
    http.calls.length = 0;
    const result = await clock.run(
      client.resolveNames(['Synthetic Bear', 'Synthetic Front // Synthetic Back']),
    );
    expect(identifiersOf(http.calls[0])).toEqual([{ name: 'Synthetic Front' }]);
    expect(result.found.size).toBe(2);
  });

  test('an entry older than the time to live is fetched again', async () => {
    const { clock, http, client } = withCards({ cards }, { cache: true });
    await clock.run(client.resolveNames(['Synthetic Bear']));
    expect(http.calls).toHaveLength(1);
    await clock.run(
      (async () => {
        await clock.sleep(24 * HOUR - 1000);
        await client.resolveNames(['Synthetic Bear']);
      })(),
    );
    expect(http.calls).toHaveLength(1);
    await clock.run(
      (async () => {
        await clock.sleep(2000);
        await client.resolveNames(['Synthetic Bear']);
      })(),
    );
    expect(http.calls).toHaveLength(2);
  });

  test('no cache: every call asks again', async () => {
    const { clock, http, client } = withCards({ cards });
    await clock.run(client.resolveNames(['Synthetic Bear']));
    await clock.run(client.resolveNames(['Synthetic Bear']));
    expect(http.calls).toHaveLength(2);
  });

  test('a cache that throws never loses a lookup', async () => {
    const clock = createFakeClock();
    const http = createFakeFetch(clock, emulateScryfall({ cards }));
    const broken = {
      get: async () => {
        throw new Error('storage unavailable');
      },
      put: async () => {
        throw new Error('storage unavailable');
      },
      delete: async () => undefined,
      clear: async () => undefined,
    };
    const client = createScryfallClient({
      fetch: http.fetch,
      now: clock.now,
      sleep: clock.sleep,
      cache: broken,
    });
    const result = await clock.run(client.resolveNames(['Synthetic Bear']));
    expect(result.found.size).toBe(1);
  });

  test('stored cards carry the injected time as fetchedAt', async () => {
    const { clock, client } = withCards({ cards });
    const start = clock.now();
    const result = await clock.run(client.resolveNames(['Synthetic Bear']));
    expect(result.found.get('synthetic bear')?.fetchedAt).toBeGreaterThanOrEqual(start);
  });
});

describe('failures stay local', () => {
  test('one failing batch does not lose the others', async () => {
    const cards = numberedCards(150);
    const base = emulateScryfall({ cards });
    const { clock, client } = setup((call, index) => {
      const first = (call.body as { identifiers?: { name: string }[] } | undefined)
        ?.identifiers?.[0];
      // The batch that starts with card 001 always fails with a server error.
      if (first?.name === 'Synthetic Card 001') return jsonResponse({}, 500);
      return base(call, index);
    });
    const result = await clock.run(client.resolveNames(cards.map((card) => String(card.name))));
    expect(result.failures).toHaveLength(75);
    expect(result.failures[0]).toEqual({
      requested: 'Synthetic Card 001',
      message: 'HTTP 500 from Scryfall',
    });
    expect(result.found.size).toBe(75);
    expect(result.found.has('synthetic card 076')).toBe(true);
    expect(result.found.has('synthetic card 001')).toBe(false);
    expect(result.notFound).toEqual([]);
  });

  test('a network error on a batch is reported per name', async () => {
    const { clock, client } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    const result = await clock.run(client.resolveNames(['Synthetic A', 'Synthetic B']));
    expect(result.found.size).toBe(0);
    expect(result.failures.map((failure) => failure.requested)).toEqual([
      'Synthetic A',
      'Synthetic B',
    ]);
    expect(result.failures[0]?.message).toBe('Failed to fetch');
  });

  test('a 400 on a batch is reported with Scryfall details', async () => {
    const { clock, client } = setup(() =>
      jsonResponse(
        { object: 'error', status: 400, code: 'bad_request', details: 'Too many.' },
        400,
      ),
    );
    const result = await clock.run(client.resolveNames(['Synthetic A']));
    expect(result.failures).toEqual([{ requested: 'Synthetic A', message: 'HTTP 400: Too many.' }]);
  });

  test('an answer that is not a collection is a failure, not a crash', async () => {
    const { clock, client } = setup(() => new Response('<html>oops</html>', { status: 200 }));
    const result = await clock.run(client.resolveNames(['Synthetic A']));
    expect(result.failures).toHaveLength(1);
  });

  test('a malformed card in the answer is skipped, the rest are matched', async () => {
    const good = syntheticCard('Synthetic Good');
    const broken: RawCard = { object: 'card', name: 'Synthetic Broken' }; // no ids
    const base = emulateScryfall({ cards: [good] });
    const { clock, client } = setup((call, index) =>
      call.method === 'POST'
        ? jsonResponse({ object: 'list', not_found: [], data: [broken, good] })
        : base(call, index),
    );
    const result = await clock.run(client.resolveNames(['Synthetic Good', 'Synthetic Broken']));
    expect(result.found.has('synthetic good')).toBe(true);
    expect(result.found.has('synthetic broken')).toBe(false);
    expect(result.notFound).toEqual(['Synthetic Broken']);
  });
});

describe('headers on every request', () => {
  test('Accept everywhere, Content-Type on POST, User-Agent when given', async () => {
    const cardsHandler = emulateScryfall({
      cards: [syntheticCard('Synthetic Bear')],
      fuzzy: { 'synthetic beartrp': syntheticCard('Synthetic Beartrap') },
    });
    const { clock, http, client } = setup(
      (call, index) =>
        call.url.includes('/cards/collection') || call.url.includes('/cards/named')
          ? cardsHandler(call, index)
          : jsonResponse({ object: 'list', data: [] }),
      { userAgent: 'CommanderArena-test/0.0.0' },
    );
    await clock.run(
      client.resolveNames(['Synthetic Bear', 'Synthetic Nothing', 'Synthetic Beartrp']),
    );
    expect(http.calls.length).toBeGreaterThanOrEqual(5);
    for (const call of http.calls) {
      expect(call.headers.Accept).toBe('application/json');
      expect(call.headers['User-Agent']).toBe('CommanderArena-test/0.0.0');
      if (call.method === 'POST') expect(call.headers['Content-Type']).toBe('application/json');
    }
  });

  test('all calls of one client share one queue and its spacing', async () => {
    const { clock, http, client } = withCards({ cards: [syntheticCard('Synthetic Bear')] });
    await clock.run(
      Promise.all([
        client.resolveNames(['Synthetic Bear']),
        client.resolveNames(['Synthetic Nope']),
      ]),
    );
    const limited = http.calls.map((call) => call.at);
    for (let index = 1; index < limited.length; index++) {
      expect((limited[index] ?? 0) - (limited[index - 1] ?? 0)).toBeGreaterThanOrEqual(500);
    }
  });
});
