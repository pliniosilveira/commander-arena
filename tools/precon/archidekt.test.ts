// The Archidekt reader (workflow "Precon issues"). Every page, answer and name here is SYNTHETIC: nothing was fetched.

import { describe, expect, test } from 'vitest';
import { clean, deckFromApi, deckIdsFromListing, preconId, preconIssue } from './archidekt.ts';

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
  const deck = { id: 7, name: 'Fake Precon Deck', text: 'Commander\n1x Zed the Test', cards: 1 };

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
