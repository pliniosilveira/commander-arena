/**
 * The pictures stored with the cards of a game's decks (`deck-images.ts`): a card of a deck is drawn from the link stored with it, a precon's
 * and an imported deck's alike, and only the others are asked for by name from Scryfall's rate-limited API. SYNTHETIC cards: invented
 * names and links of the Scryfall image host's shape.
 */
import {
  createScryfallClient,
  MemoryCardCache,
  MemorySupportCache,
  type ScryfallClient,
  type StoredCard,
} from '@commander-arena/cards';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { createImportService, MemoryDeckStore } from '../src/import';
import {
  createPrecons,
  type DeckLibrary,
  savedDeckChoiceId,
  startOptionsFor,
  startTableOptionsFor,
} from '../src/precons';
import { Art } from '../src/ui/board/art';
import { setGameImages, storedImage } from '../src/ui/board/deck-images';
import { createFakeScryfall, createVirtualClock } from './import-fake-scryfall';
import { supportedHundredText } from './import-helpers';
import { playableSnapshot, preconsOf } from './precons-helpers';

const HOST = 'https://cards.scryfall.io';

const card = (name: string, faces: readonly string[]): StoredCard =>
  ({
    name: faces.length > 1 ? `${faces[0]} // ${faces[1]}` : name,
    faces: faces.map((face) => ({
      name: face,
      imageUris: {
        normal: `${HOST}/normal/${face}.jpg`,
        large: `${HOST}/large/${face}.jpg`,
        artCrop: `${HOST}/art_crop/${face}.jpg`,
      },
    })),
  }) as unknown as StoredCard;

describe('storedImage', () => {
  test('the picture asked for in the version asked for, by the owner of the card', () => {
    setGameImages([[card('SYNTHETIC Bear', ['SYNTHETIC Bear'])], []]);
    expect(storedImage('SYNTHETIC Bear', 0, false, 'normal')).toBe(
      `${HOST}/normal/SYNTHETIC Bear.jpg`,
    );
    expect(storedImage('SYNTHETIC Bear', 0, false, 'small')).toBe(
      `${HOST}/normal/SYNTHETIC Bear.jpg`,
    );
    expect(storedImage('SYNTHETIC Bear', 0, false, 'art_crop')).toBe(
      `${HOST}/art_crop/SYNTHETIC Bear.jpg`,
    );
    // Another seat's deck does not hold it, and a card nobody stores has none.
    expect(storedImage('SYNTHETIC Bear', 1, false, 'normal')).toBeNull();
    expect(storedImage('SYNTHETIC Wolf', 0, false, 'normal')).toBeNull();
  });

  test('a double-faced card is found by its front face and has a picture for each face', () => {
    setGameImages([[card('x', ['SYNTHETIC Rush', 'SYNTHETIC Falls'])]]);
    expect(storedImage('SYNTHETIC Rush', 0, false, 'normal')).toBe(
      `${HOST}/normal/SYNTHETIC Rush.jpg`,
    );
    expect(storedImage('SYNTHETIC Rush', 0, true, 'normal')).toBe(
      `${HOST}/normal/SYNTHETIC Falls.jpg`,
    );
    expect(storedImage('SYNTHETIC Rush // SYNTHETIC Falls', 0, true, 'art_crop')).toBe(
      `${HOST}/art_crop/SYNTHETIC Falls.jpg`,
    );
  });

  test('a card with one face has no back picture, and a link of another host is never used', () => {
    const other = {
      name: 'SYNTHETIC Odd',
      faces: [
        {
          name: 'SYNTHETIC Odd',
          imageUris: { normal: 'https://evil.example/a.jpg', large: null, artCrop: null },
        },
      ],
    } as unknown as StoredCard;
    setGameImages([[card('SYNTHETIC Bear', ['SYNTHETIC Bear']), other]]);
    expect(storedImage('SYNTHETIC Bear', 0, true, 'normal')).toBeNull();
    expect(storedImage('SYNTHETIC Odd', 0, false, 'normal')).toBeNull();
    expect(storedImage('SYNTHETIC Odd', 0, false, 'art_crop')).toBeNull();
  });

  test('the next game replaces the pictures of the one before', () => {
    setGameImages([[card('SYNTHETIC Bear', ['SYNTHETIC Bear'])]]);
    setGameImages([[]]);
    expect(storedImage('SYNTHETIC Bear', 0, false, 'normal')).toBeNull();
  });
});

describe('the card art of a game', () => {
  const html = (name: string, owner: number | undefined) =>
    renderToStaticMarkup(
      <Art
        name={name}
        isToken={false}
        version="normal"
        className="pic"
        {...(owner === undefined ? {} : { owner })}
      />,
    );

  test('a card of a deck is drawn from its stored link, without a lookup by name', () => {
    setGameImages([[card('SYNTHETIC Bear', ['SYNTHETIC Bear'])]]);
    const drawn = html('SYNTHETIC Bear', 0);
    expect(drawn).toContain(`${HOST}/normal/SYNTHETIC Bear.jpg`);
    expect(drawn).not.toContain('api.scryfall.com');
  });

  test('a card the decks do not store, or with no owner, is asked for by name as before', () => {
    setGameImages([[card('SYNTHETIC Bear', ['SYNTHETIC Bear'])]]);
    expect(html('Island', 0)).toContain('api.scryfall.com/cards/named?exact=Island');
    expect(html('SYNTHETIC Bear', undefined)).not.toContain(HOST);
  });
});

describe('the decks of a game hold the stored cards of their lists', () => {
  function setup() {
    const clock = createVirtualClock();
    const client: ScryfallClient = createScryfallClient({
      fetch: createFakeScryfall().fetch,
      now: clock.now,
      sleep: clock.sleep,
      cache: new MemoryCardCache({ now: clock.now }),
    });
    const supportCache = new MemorySupportCache();
    const serviceFor = (source: ScryfallClient) =>
      createImportService({ client: source, supportCache });
    const decks = new MemoryDeckStore(clock.now);
    const library: DeckLibrary = { decks, client };
    return { decks, library, serviceFor };
  }

  test('a precon deck: every card of its list, commander included, with its picture links', async () => {
    const { library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const deck = await precons.prepare('p');
    expect(deck.ok).toBe(true);
    if (!deck.ok) return;
    const names = deck.images.map((c) => c.name);
    expect(names).toContain('Synthetic Commander');
    expect(names).toContain('Forest');
    expect(deck.images.every((c) => c.faces[0]?.imageUris?.normal)).toBe(true);
  });

  test('an imported deck, saved and prepared the same way, holds them too', async () => {
    const { decks, library, serviceFor } = setup();
    const precons = createPrecons([await playableSnapshot('p')], serviceFor, library);
    const mine = await decks.save({ name: 'Imported', text: supportedHundredText() });
    const deck = await precons.prepare(savedDeckChoiceId(mine.id));
    expect(deck.ok).toBe(true);
    if (!deck.ok) return;
    expect(deck.images.map((c) => c.name)).toContain('Synthetic Commander');
    expect(deck.images.every((c) => c.faces[0]?.imageUris?.normal)).toBe(true);
  });
});

describe('a game starts with the pictures of its decks', () => {
  // A snapshot whose cards link to the Scryfall image host, as the shipped ones do, a different deck of each seat by its id.
  const withLinks = async (id: string) => {
    const snapshot = await playableSnapshot(id);
    return {
      ...snapshot,
      cards: snapshot.cards.map((c) => ({
        ...c,
        faces: c.faces.map((f) => ({
          ...f,
          imageUris: {
            normal: `${HOST}/${id}/normal.jpg`,
            large: null,
            artCrop: `${HOST}/${id}/art.jpg`,
          },
        })),
      })),
    };
  };

  test('a duel: each seat draws its own deck, whoever holds the same card', async () => {
    const precons = preconsOf([await withLinks('a'), await withLinks('b')]);
    const result = await startOptionsFor(precons, {
      seed: 1,
      humanDeck: 'a',
      aiDeck: 'b',
      allowHidden: false,
    });
    expect(result.ok).toBe(true);
    expect(storedImage('Forest', 0, false, 'normal')).toBe(`${HOST}/a/normal.jpg`);
    expect(storedImage('Forest', 1, false, 'art_crop')).toBe(`${HOST}/b/art.jpg`);
  });

  test('a table: every opponent has its own seat', async () => {
    const precons = preconsOf([await withLinks('a'), await withLinks('b'), await withLinks('c')]);
    const result = await startTableOptionsFor(precons, {
      seed: 1,
      humanDeck: 'a',
      opponentDecks: ['b', 'c'],
      allowHidden: false,
    });
    expect(result.ok).toBe(true);
    expect(storedImage('Forest', 0, false, 'normal')).toBe(`${HOST}/a/normal.jpg`);
    expect(storedImage('Forest', 1, false, 'normal')).toBe(`${HOST}/b/normal.jpg`);
    expect(storedImage('Forest', 2, false, 'normal')).toBe(`${HOST}/c/normal.jpg`);
  });
});
