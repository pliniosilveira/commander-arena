import { describe, expect, test } from 'vitest';
import { createRequestQueue } from '../src/scryfall';
import { createFakeClock, createFakeFetch, type Handler, jsonResponse } from './scryfall-helpers';

// All responses are SYNTHETIC: only the status codes and headers matter here.

const COLLECTION = 'https://api.scryfall.com/cards/collection';
const NAMED = 'https://api.scryfall.com/cards/named?exact=x';
const RULINGS = 'https://api.scryfall.com/cards/synthetic-id/rulings';
const FILE = 'https://data.scryfall.io/oracle-cards/synthetic.jsonl.gz';

function setup(handler: Handler, userAgent?: string) {
  const clock = createFakeClock();
  const http = createFakeFetch(clock, handler);
  const queue = createRequestQueue({
    fetch: http.fetch,
    now: clock.now,
    sleep: clock.sleep,
    userAgent,
  });
  return { clock, http, queue };
}

const ok: Handler = () => jsonResponse({ ok: true });

describe('rate spacing and ordering', () => {
  test('limited endpoints start 500 ms apart, in submission order', async () => {
    const { clock, http, queue } = setup(ok);
    const urls = [COLLECTION, NAMED, 'https://api.scryfall.com/cards/search?q=x'];
    await clock.run(Promise.all(urls.map((url) => queue.request({ url }))));
    expect(http.calls.map((call) => call.url)).toEqual(urls);
    const [first, second, third] = http.calls.map((call) => call.at);
    expect(second).toBe((first ?? 0) + 500);
    expect(third).toBe((first ?? 0) + 1000);
  });

  test('all four limited endpoints share the 500 ms spacing', async () => {
    const { clock, http, queue } = setup(ok);
    const paths = ['collection', 'named?fuzzy=x', 'search?q=x', 'random'];
    await clock.run(
      Promise.all(
        paths.map((path) => queue.request({ url: `https://api.scryfall.com/cards/${path}` })),
      ),
    );
    const times = http.calls.map((call) => call.at);
    for (let index = 1; index < times.length; index++) {
      expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBe(500);
    }
  });

  test('other API endpoints start 100 ms apart', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(
      Promise.all(
        [RULINGS, `${RULINGS}2`, 'https://api.scryfall.com/bulk-data'].map((url) =>
          queue.request({ url }),
        ),
      ),
    );
    const times = http.calls.map((call) => call.at);
    expect(times[1]).toBe((times[0] ?? 0) + 100);
    expect(times[2]).toBe((times[0] ?? 0) + 200);
  });

  test('a limited request also counts towards the 10 per second budget', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(
      Promise.all([queue.request({ url: COLLECTION }), queue.request({ url: RULINGS })]),
    );
    expect((http.calls[1]?.at ?? 0) - (http.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(100);
  });

  test('files on scryfall.io are not limited', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(
      Promise.all([FILE, `${FILE}1`, `${FILE}2`, `${FILE}3`].map((url) => queue.request({ url }))),
    );
    expect(http.calls).toHaveLength(4);
    expect(new Set(http.calls.map((call) => call.at)).size).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  test('a request that arrives later than the spacing starts at once', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(queue.request({ url: COLLECTION }));
    clock.sleeps.length = 0;
    await clock.run(
      (async () => {
        await clock.sleep(2000);
        return queue.request({ url: COLLECTION });
      })(),
    );
    expect(http.calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([2000]);
  });
});

describe('HTTP 429', () => {
  test('honours Retry-After seconds, then retries and succeeds', async () => {
    const { clock, http, queue } = setup((_call, index) =>
      index === 0 ? jsonResponse({}, 429, { 'retry-after': '5' }) : jsonResponse({ ok: true }),
    );
    const outcome = await clock.run(queue.request({ url: COLLECTION }));
    expect(outcome).toMatchObject({ kind: 'response', status: 200, attempts: 2 });
    expect((http.calls[1]?.at ?? 0) - (http.calls[0]?.at ?? 0)).toBe(5000);
  });

  test('backs off 1 s, 2 s, 4 s without Retry-After', async () => {
    const { clock, http, queue } = setup((_call, index) =>
      index < 3 ? jsonResponse({}, 429) : jsonResponse({ ok: true }),
    );
    const outcome = await clock.run(queue.request({ url: COLLECTION }));
    expect(outcome).toMatchObject({ kind: 'response', status: 200, attempts: 4 });
    const gaps = http.calls.slice(1).map((call, index) => call.at - (http.calls[index]?.at ?? 0));
    expect(gaps).toEqual([1000, 2000, 4000]);
  });

  test('gives up after 3 retries with a typed failure', async () => {
    const { clock, http, queue } = setup(() => jsonResponse({}, 429));
    const outcome = await clock.run(queue.request({ url: COLLECTION }));
    expect(http.calls).toHaveLength(4);
    expect(outcome).toMatchObject({
      kind: 'failure',
      reason: 'rate-limited',
      status: 429,
      attempts: 4,
    });
  });

  test('does not wait for a Retry-After beyond the limit', async () => {
    const { clock, http, queue } = setup(() => jsonResponse({}, 429, { 'retry-after': '3600' }));
    const outcome = await clock.run(queue.request({ url: COLLECTION }));
    expect(http.calls).toHaveLength(1);
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'rate-limited' });
  });

  test('stops the whole queue, not only the request that was limited', async () => {
    const { clock, http, queue } = setup((call, index) =>
      call.url === COLLECTION && index === 0
        ? jsonResponse({}, 429, { 'retry-after': '3' })
        : jsonResponse({ ok: true }),
    );
    const [limited, other] = await clock.run(
      Promise.all([queue.request({ url: COLLECTION }), queue.request({ url: RULINGS })]),
    );
    expect(limited).toMatchObject({ kind: 'response', status: 200 });
    expect(other).toMatchObject({ kind: 'response', status: 200 });
    const firstAt = http.calls[0]?.at ?? 0;
    const rulings = http.calls.find((call) => call.url === RULINGS);
    // The rulings request was submitted at the same moment but may not start before the pause ends.
    expect((rulings?.at ?? 0) - firstAt).toBeGreaterThanOrEqual(3000);
  });
});

describe('errors and retries', () => {
  test('a network error retries twice (1 s, 2 s) and then fails', async () => {
    const { clock, http, queue } = setup(() => {
      throw new TypeError('fetch failed');
    });
    const outcome = await clock.run(queue.request({ url: COLLECTION }));
    expect(http.calls).toHaveLength(3);
    expect(clock.sleeps.filter((ms) => ms >= 1000)).toEqual([1000, 2000]);
    expect(outcome).toMatchObject({
      kind: 'failure',
      reason: 'network',
      message: 'fetch failed',
      status: null,
      attempts: 3,
    });
  });

  test('a 5xx answer retries and can recover', async () => {
    const { clock, http, queue } = setup((_call, index) =>
      index === 0 ? jsonResponse({}, 503) : jsonResponse({ ok: true }),
    );
    const outcome = await clock.run(queue.request({ url: NAMED }));
    expect(http.calls).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: 'response', status: 200, attempts: 2 });
  });

  test('a persistent 5xx answer becomes a typed failure after 3 sends', async () => {
    const { clock, http, queue } = setup(() => jsonResponse({}, 500));
    const outcome = await clock.run(queue.request({ url: NAMED }));
    expect(http.calls).toHaveLength(3);
    expect(outcome).toMatchObject({ kind: 'failure', reason: 'server', status: 500 });
  });

  test('a 404 or 400 is an answer, not a failure, and is not retried', async () => {
    const { clock, http, queue } = setup(() => jsonResponse({ object: 'error' }, 404));
    const outcome = await clock.run(queue.request({ url: NAMED }));
    expect(http.calls).toHaveLength(1);
    expect(outcome).toMatchObject({ kind: 'response', status: 404, ok: false });
  });

  test('a body that is not JSON gives an undefined json', async () => {
    const { clock, queue } = setup(() => new Response('<html>', { status: 200 }));
    const outcome = await clock.run(queue.request({ url: NAMED }));
    expect(outcome).toMatchObject({ kind: 'response', status: 200, json: undefined });
  });

  test('one failing request does not block the next ones', async () => {
    const { clock, queue } = setup((_call, index) => {
      if (index < 3) throw new TypeError('offline');
      return jsonResponse({ ok: true });
    });
    const [first, second] = await clock.run(
      Promise.all([queue.request({ url: COLLECTION }), queue.request({ url: COLLECTION })]),
    );
    expect(first.kind).toBe('failure');
    expect(second.kind).toBe('response');
  });
});

describe('headers and bodies', () => {
  test('every request sends Accept: application/json', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(
      Promise.all([COLLECTION, NAMED, RULINGS, FILE].map((url) => queue.request({ url }))),
    );
    expect(http.calls).toHaveLength(4);
    for (const call of http.calls) expect(call.headers.Accept).toBe('application/json');
  });

  test('a POST sends Content-Type: application/json and the JSON body', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(
      queue.request({ url: COLLECTION, method: 'POST', json: { identifiers: [{ name: 'X' }] } }),
    );
    expect(http.calls[0]?.method).toBe('POST');
    expect(http.calls[0]?.headers['Content-Type']).toBe('application/json');
    expect(http.calls[0]?.body).toEqual({ identifiers: [{ name: 'X' }] });
  });

  test('a GET sends no Content-Type', async () => {
    const { clock, http, queue } = setup(ok);
    await clock.run(queue.request({ url: NAMED }));
    expect(http.calls[0]?.method).toBe('GET');
    expect(http.calls[0]?.headers['Content-Type']).toBeUndefined();
  });

  test('User-Agent is sent only when one is given, also on retries', async () => {
    const without = setup(ok);
    await without.clock.run(without.queue.request({ url: NAMED }));
    expect(without.http.calls[0]?.headers['User-Agent']).toBeUndefined();

    const withAgent = setup(
      (_call, index) => (index === 0 ? jsonResponse({}, 429) : jsonResponse({ ok: true })),
      'CommanderArena-test/0.0.0',
    );
    await withAgent.clock.run(withAgent.queue.request({ url: NAMED }));
    expect(withAgent.http.calls).toHaveLength(2);
    for (const call of withAgent.http.calls) {
      expect(call.headers['User-Agent']).toBe('CommanderArena-test/0.0.0');
      expect(call.headers.Accept).toBe('application/json');
    }
  });
});
