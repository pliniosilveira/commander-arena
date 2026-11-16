// The Archidekt scan with a fake fetch: nothing here touches a network. Every page and answer is SYNTHETIC.

import { describe, expect, test } from 'vitest';
import { scanArchidekt } from './scan.ts';

const hundred = Array.from({ length: 100 }, (_, i) => ({
  quantity: 1,
  categories: i === 0 ? ['Commander'] : [],
  card: { oracleCard: { name: `Card ${i}` } },
}));

function fakeFetch(pages: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (url: string) => {
    calls.push(String(url));
    const body = pages[String(url)];
    if (body === undefined) return new Response('no', { status: 404 });
    return typeof body === 'string' ? new Response(body) : Response.json(body);
  }) as unknown as typeof fetch;
}

const base = (pages: Record<string, unknown>, extra = {}) => {
  const log: string[] = [];
  const calls: string[] = [];
  return {
    log,
    calls,
    options: {
      fetch: fakeFetch(pages, calls),
      sleep: async () => {},
      log: (line: string) => log.push(line),
      delayMs: 0,
      ...extra,
    },
  };
};

describe('the Archidekt scan', () => {
  test('reads each linked deck, leaves out one that is not 100 cards or cannot be read, and goes on', async () => {
    const run = base({
      'https://archidekt.com/commander-precons':
        '<a href="/decks/1/a">a</a><a href="/decks/2/b">b</a><a href="/decks/3">c</a><a href="/decks/4">d</a>',
      'https://archidekt.com/api/decks/1/': { name: 'Deck One', cards: hundred },
      'https://archidekt.com/api/decks/2/': { name: 'Short', cards: hundred.slice(0, 10) },
      'https://archidekt.com/api/decks/3/': { nope: true },
      // deck 4: HTTP 404
    });
    const decks = await scanArchidekt(run.options);
    expect(decks.map((d) => d.name)).toEqual(['Deck One']);
    expect(run.log.join('\n')).toContain(
      'has 10 cards, a precon has 100 (up to 130 with a planar deck) (Commander 1, no category 9)',
    );
    expect(run.log.join('\n')).toContain('deck 3: the answer has no name');
    expect(run.log.join('\n')).toContain('answered HTTP 404');
  });

  test('--ids skips the listing, --limit cuts the list, any size is kept on request', async () => {
    const pages = {
      'https://archidekt.com/api/decks/5/': { name: 'Five', cards: hundred.slice(0, 40) },
      'https://archidekt.com/api/decks/6/': { name: 'Six', cards: hundred },
    };
    const run = base(pages, { ids: [5, 6], anySize: true, limit: 1 });
    const decks = await scanArchidekt(run.options);
    expect(decks.map((d) => d.id)).toEqual([5]);
    expect(run.calls).toEqual(['https://archidekt.com/api/decks/5/']);
  });

  test('a listing with no deck link is an error that shows the start of the page', async () => {
    const run = base({ 'https://archidekt.com/commander-precons': '<html>drawn by script</html>' });
    await expect(scanArchidekt(run.options)).rejects.toThrow(/links to no deck/);
    expect(run.log.join('\n')).toContain('drawn by script');
  });
});
