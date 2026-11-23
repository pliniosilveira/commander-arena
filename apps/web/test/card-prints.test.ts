// The printings picker of the deck screen's card dialog. The Scryfall answers here are SYNTHETIC: invented ids and image links.
import { expect, test } from 'vitest';
import {
  cardPrintsUrl,
  listedKey,
  parseCardPrints,
  parseListedImages,
  printLabel,
} from '../src/ui/import/card-prints';

const img = (id: string) => ({
  small: `https://cards.scryfall.io/small/front/${id}.jpg`,
  normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
  large: `https://cards.scryfall.io/large/front/${id}.jpg`,
});

test('the search asks for every paper printing of one card by exact name', () => {
  const url = cardPrintsUrl('Front // Back');
  expect(decodeURIComponent(url)).toContain('!"Front" game:paper');
  expect(url).toContain('unique=prints');
  expect(decodeURIComponent(cardPrintsUrl('A "Q" Name'))).toContain('!"A \\"Q\\" Name"');
});

test('printings are parsed with their frame, in the order given; foreign images are dropped', () => {
  const prints = parseCardPrints({
    data: [
      {
        id: 'a',
        set: 'abc',
        set_name: 'Alpha Set',
        collector_number: '6',
        released_at: '2026-01-01',
        rarity: 'mythic',
        border_color: 'borderless',
        frame_effects: ['showcase'],
        nonfoil: false,
        image_uris: img('a'),
      },
      { id: 'b', set: 'xyz', image_uris: { normal: 'https://evil.example/n.jpg' } },
      { id: 'c', set: 'dfc', set_name: 'Two', card_faces: [{ image_uris: img('c') }] },
    ],
  });
  expect(prints.map((p) => p.id)).toEqual(['a', 'c']);
  expect(prints[0]?.frames).toEqual(['Borderless', 'Showcase']);
  expect(prints[0]?.foilOnly).toBe(true);
  expect(prints[0] && printLabel(prints[0])).toBe('Alpha Set #6 · Borderless, Showcase');
  expect(prints[1]?.large).toBe('https://cards.scryfall.io/large/front/c.jpg');
});

test('a malformed answer gives no printings', () => {
  expect(parseCardPrints(null)).toEqual([]);
  expect(parseCardPrints({ data: 'x' })).toEqual([]);
});

test('a collection answer is read by set and number, not by position; foreign images are dropped', () => {
  const images = parseListedImages({
    data: [
      { name: 'Card B', set: 'XYZ', collector_number: '12', image_uris: img('b') },
      {
        name: 'Card C',
        set: 'abc',
        collector_number: '3',
        image_uris: { normal: 'https://evil.example/c.jpg' },
      },
    ],
    not_found: [{ set: 'abc', collector_number: '3' }],
  });
  expect([...images.keys()]).toEqual(['xyz/12']);
  expect(images.get(listedKey({ set: 'xyz', collector: '12' }))).toEqual({
    name: 'Card B',
    normal: 'https://cards.scryfall.io/normal/front/b.jpg',
  });
  expect(parseListedImages(null).size).toBe(0);
});
