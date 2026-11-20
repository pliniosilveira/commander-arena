// Issue 366: a commander is drawn with a special printing (borderless, extended art, showcase, full art), not a foil, when Scryfall has one.
// The Scryfall answers here are SYNTHETIC: invented ids and image links, no real card.
import { expect, test } from 'vitest';
import {
  commanderArtQuery,
  createCommanderArtLookup,
  parseCommanderSearch,
} from '../src/ui/board/commander-art';

const IMG = (id: string) => ({
  small: `https://cards.scryfall.io/small/front/${id}.jpg`,
  normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
  art_crop: `https://cards.scryfall.io/art_crop/front/${id}.jpg`,
});

test('the query asks for one commander by exact name, paper, non-foil, and a special frame', () => {
  const q = commanderArtQuery('Giada, Font of Hope');
  expect(q).toContain('!"Giada, Font of Hope"');
  expect(q).toContain('game:paper');
  expect(q).toContain('is:nonfoil');
  for (const frame of ['is:borderless', 'is:extendedart', 'is:showcase', 'is:fullart']) {
    expect(q).toContain(frame);
  }
});

test('the second search also accepts a foil-only printing', () => {
  expect(commanderArtQuery('Ghoulcaller Gisa')).toContain('is:nonfoil');
  expect(commanderArtQuery('Ghoulcaller Gisa', true)).not.toContain('is:nonfoil');
  expect(commanderArtQuery('Ghoulcaller Gisa', true)).toContain('is:borderless');
});

test('a double-faced name is asked by its front face and a quote in a name is escaped', () => {
  expect(commanderArtQuery('Front Name // Back Name')).toContain('!"Front Name"');
  expect(commanderArtQuery('A "Quoted" Name')).toContain('!"A \\"Quoted\\" Name"');
});

test('the first printing that has pictures is taken; one without is skipped', () => {
  const answer = {
    object: 'list',
    data: [
      { id: 'no-images' },
      { id: 'a', image_uris: IMG('a') },
      { id: 'b', image_uris: IMG('b') },
    ],
  };
  expect(parseCommanderSearch(answer)?.normal).toBe('https://cards.scryfall.io/normal/front/a.jpg');
});

test('a printing that shows another name than the card is skipped', () => {
  const answer = {
    data: [
      { name: 'Giada, Font of Hope', printed_name: 'Miku, Font of Pop', image_uris: IMG('miku') },
      {
        name: 'Giada, Font of Hope',
        printed_name: 'Giada, Font of Hope',
        image_uris: IMG('giada'),
      },
    ],
  };
  expect(parseCommanderSearch(answer)?.normal).toBe(
    'https://cards.scryfall.io/normal/front/giada.jpg',
  );
});

test('an empty or malformed answer, or images from another host, is no match', () => {
  expect(parseCommanderSearch({ object: 'list', data: [] })).toBeNull();
  expect(parseCommanderSearch(null)).toBeNull();
  expect(
    parseCommanderSearch({ data: [{ image_uris: { normal: 'https://evil.invalid/x.jpg' } }] }),
  ).toBeNull();
});

test('the lookup asks Scryfall once per query and remembers the answer, a miss included', async () => {
  const urls: string[] = [];
  const queue = {
    request: async ({ url }: { url: string }) => {
      urls.push(url);
      return {
        kind: 'response' as const,
        status: 200,
        ok: true,
        attempts: 1,
        json: url.includes('Known')
          ? { data: [{ image_uris: IMG('k') }] }
          : { object: 'list', data: [] },
      };
    },
  };
  const lookup = createCommanderArtLookup(queue);
  const a = await lookup(commanderArtQuery('Known Commander'));
  const b = await lookup(commanderArtQuery('Known Commander'));
  const c = await lookup(commanderArtQuery('Unknown Commander'));
  await lookup(commanderArtQuery('Unknown Commander'));
  expect(a?.normal).toContain('/k.jpg');
  expect(b).toEqual(a);
  expect(c).toBeNull();
  expect(urls).toHaveLength(2);
  expect(urls[0]).toContain('https://api.scryfall.com/cards/search?q=');
  expect(urls[0]).toContain('unique=prints');
});
