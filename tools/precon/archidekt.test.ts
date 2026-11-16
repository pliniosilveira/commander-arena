// The Archidekt reader (workflow "Precon issues"). Every page, answer and name here is SYNTHETIC: nothing was fetched.

import { describe, expect, test } from 'vitest';
import {
  clean,
  deckFromApi,
  deckIdsFromListing,
  isSameList,
  listDiff,
  listHash,
  preconId,
  preconIssue,
  sameDeck,
} from './archidekt.ts';

describe('the ids of a listing page', () => {
  test('are the deck links, once each, in order, whatever follows the id', () => {
    const page = `<a href="/decks/123/some-deck">A</a> <a href="https://archidekt.com/decks/45">B</a>
      <a href="/decks/123">again</a> <script>{"url":"/decks/9001/x"}</script> <a href="/decks/abc">no</a> /decks/0 /decks/1234567890123 (too long, and zero, are not ids)`;
    expect(deckIdsFromListing(page)).toEqual([123, 45, 9001]);
  });

  test('a page with no deck link has none', () => {
    expect(deckIdsFromListing('<html>nothing</html>')).toEqual([]);
  });
});

describe('a name from outside', () => {
  test('is one short line with no mention and no control character', () => {
    expect(clean('  Evil\n@everyone\u0000 deck​  ')).toBe('Evil @ everyone deck');
    expect(clean('x'.repeat(300))).toHaveLength(100);
  });
});

const answer = {
  name: 'Fake  Precon\nDeck',
  cards: [
    { quantity: 1, categories: ['Commander'], card: { oracleCard: { name: 'Zed the Test' } } },
    { quantity: 3, categories: ['Land'], card: { oracleCard: { name: 'Forest' } } },
    { quantity: 1, categories: [], card: { name: 'Plain Card' } },
    { quantity: 1, categories: ['Sideboard'], card: { oracleCard: { name: 'Left Out' } } },
    { quantity: 1, categories: ['Maybeboard'], card: { oracleCard: { name: 'Also Out' } } },
    { quantity: 0, categories: [], card: { oracleCard: { name: 'Zero' } } },
    { quantity: 1, categories: [], card: {} },
  ],
};

describe('a deck from the API', () => {
  test('is the commander, then the main deck, without the sideboard and the maybeboard', () => {
    const deck = deckFromApi(7, answer);
    if (typeof deck === 'string') throw new Error(deck);
    expect(deck.name).toBe('Fake Precon Deck');
    expect(deck.cards).toBe(5);
    expect(deck.text).toBe('Commander\n1x Zed the Test\n\nMainboard\n1x Plain Card\n3x Forest');
  });

  test('leaves out the categories the deck itself says are not in it, and tokens, and says what it counted', () => {
    const extra = (category: string, quantity: number, name: string) => ({
      quantity,
      categories: [category],
      card: { oracleCard: { name } },
    });
    const deck = deckFromApi(9, {
      name: 'Box Deck',
      categories: [
        { name: 'Ramp', includedInDeck: true },
        { name: 'Side Stuff', includedInDeck: false },
      ],
      cards: [
        extra('Commander', 1, 'Zed the Test'),
        extra('Ramp', 98, 'Forest'),
        extra('Side Stuff', 4, 'Spare One'),
        extra('Sideboard', 5, 'Spare Two'),
        extra('Tokens', 6, 'Test Token'),
      ],
    });
    if (typeof deck === 'string') throw new Error(deck);
    expect(deck.cards).toBe(99);
    expect(deck.text).not.toContain('Spare');
    expect(deck.text).not.toContain('Token');
    expect(deck.breakdown).toBe(
      'Commander 1, Ramp 98, Side Stuff 4 (left out), Sideboard 5 (left out), Tokens 6 (left out)',
    );
  });

  test('says what is wrong with an answer it cannot use', () => {
    expect(deckFromApi(1, null)).toMatch(/not an object/);
    expect(deckFromApi(1, { cards: [] })).toMatch(/no name/);
    expect(deckFromApi(1, { name: 'x' })).toMatch(/no cards/);
    expect(deckFromApi(1, { name: 'x', cards: [] })).toMatch(/no card could be read/);
  });
});

describe('an id for a ready-made deck', () => {
  test('is lower case with single dashes', () => {
    expect(preconId('Ghoulcaller Gisa: Zombies!')).toBe('ghoulcaller-gisa-zombies');
    expect(preconId('Éowyn’s Rohan')).toBe('eowyn-s-rohan');
    expect(preconId('!!!')).toBe('precon');
  });
});

describe('the issue', () => {
  const deck = {
    id: 7,
    name: 'Fake Precon Deck',
    text: 'Commander\n1x Zed the Test',
    cards: 1,
    breakdown: '',
  };

  test('of a deck with an unsupported card is a deck support issue the app button would write, plus the precon request', () => {
    const issue = preconIssue({
      deck,
      unsupported: ['Card A', 'Card B'],
      why: ['### Card A\n- grammar: stopped at "x"', '### Card B\n- engine: cannot run it yet'],
      notFound: [],
    });
    expect(issue.title).toBe('deck support Fake Precon Deck');
    expect(issue.needsSupport).toBe(true);
    expect(issue.body.startsWith('Commander\n1x Zed the Test\n\n---\n\n')).toBe(true);
    expect(issue.body).toContain('Unsupported cards (2): Card A; Card B');
    expect(issue.body).toContain('### Card B');
    expect(issue.body).toContain('add the deck as a prebuilt deck (a precon) in the app');
    expect(issue.body).toContain('--id fake-precon-deck');
    expect(issue.body).toContain('https://archidekt.com/decks/7');
  });

  test('of a deck the game already runs only asks for its place, under a title that does not start the routine', () => {
    const issue = preconIssue({ deck, unsupported: [], why: [], notFound: ['Odd Name'] });
    expect(issue.title).toBe('precon Fake Precon Deck');
    expect(issue.needsSupport).toBe(false);
    expect(issue.body).not.toContain('Unsupported cards');
    expect(issue.body).toContain('already supports every card');
    expect(issue.body).toContain('Names not found: Odd Name');
  });
});

describe('the same deck', () => {
  const deck = Array.from({ length: 100 }, (_, i) => `Card ${i}`);

  test('is a list that shares at least four fifths of its names, whatever the case', () => {
    expect(
      sameDeck(
        deck,
        deck.map((n) => n.toUpperCase()),
      ),
    ).toBe(true);
    expect(
      sameDeck(deck, [...deck.slice(0, 91), ...Array.from({ length: 9 }, (_, i) => `Other ${i}`)]),
    ).toBe(true);
  });

  test('is not another precon that shares some staples, or an empty list', () => {
    expect(
      sameDeck(deck, [...deck.slice(0, 60), ...Array.from({ length: 40 }, (_, i) => `Other ${i}`)]),
    ).toBe(false);
    expect(sameDeck(deck, [])).toBe(false);
    expect(sameDeck([], [])).toBe(false);
  });
});

describe('what differs between two lists', () => {
  const ours = [
    { name: 'Alpha', count: 1 },
    { name: 'Beta', count: 2 },
    { name: 'Gamma', count: 1 },
  ];
  const theirs = [
    { name: 'alpha', count: 1 },
    { name: 'Beta', count: 3 },
    { name: 'Delta', count: 1 },
  ];

  test('is what to add, what to remove and the counts that changed, by name without case', () => {
    const diff = listDiff(ours, theirs);
    expect(diff.added).toEqual([{ name: 'Delta', count: 1 }]);
    expect(diff.removed).toEqual([{ name: 'Gamma', count: 1 }]);
    expect(diff.changed).toEqual([{ name: 'Beta', ours: 2, theirs: 3 }]);
    expect(isSameList(diff)).toBe(false);
    expect(
      isSameList(
        listDiff(
          ours,
          ours.map((e) => ({ ...e, name: e.name.toUpperCase() })),
        ),
      ),
    ).toBe(true);
  });

  test('has a six digit fingerprint that ignores order and case and changes with the list', () => {
    const hash = listHash(ours);
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
    expect(listHash([...ours].reverse().map((e) => ({ ...e, name: e.name.toLowerCase() })))).toBe(
      hash,
    );
    expect(listHash(theirs)).not.toBe(hash);
  });
});
