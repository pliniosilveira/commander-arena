/** Issue 32: a token that is a copy of a card is drawn with the art of that card (no token card of its own exists on Scryfall). */
import type { TokenDefinition } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import { Art } from '../src/ui/board/art';
import { setGamePrintings } from '../src/ui/board/deck-printings';

afterEach(() => setGamePrintings([]));

/** SYNTHETIC: a definition shaped like a TokenDefinition, not taken from a real game. */
const definition = (manaCost: string | null): TokenDefinition =>
  ({
    name: 'Grizzly Bears',
    manaCost,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
    abilities: [],
  }) as unknown as TokenDefinition;

// renderToStaticMarkup renders the image of `LoadedArt` (it starts as loading, not hidden), so the src shows.
const html = (manaCost: string | null) =>
  renderToStaticMarkup(
    <Art
      name="Grizzly Bears"
      isToken
      version="normal"
      className="art"
      tokenDefinition={definition(manaCost)}
    />,
  );

test('a token with a mana cost is a copy of a card: its picture is the card by name', () => {
  expect(html('{1}{G}')).toContain(
    'src="https://api.scryfall.com/cards/named?exact=Grizzly%20Bears&amp;format=image&amp;version=normal"',
  );
});

test('a token with no mana cost keeps the token search: no card picture by name', () => {
  expect(html(null)).not.toContain('cards/named');
});

test('an Embalm or Eternalize copy has no mana cost but the name of a card a deck lists: its picture is that card', () => {
  // CR 702.128a (Embalm), 702.129a (Eternalize): the token copy of the card has no mana cost.
  setGamePrintings(['Commander\n1 Some Commander\n\nDeck\n1 Grizzly Bears\n', '1 Forest\n']);
  expect(html(null)).toContain(
    'src="https://api.scryfall.com/cards/named?exact=Grizzly%20Bears&amp;format=image&amp;version=normal"',
  );
  // The opponent's deck counts too: a copy of an opponent's card has that card's name.
  setGamePrintings(['1 Forest\n', '1 Grizzly Bears\n']);
  expect(html(null)).toContain('cards/named?exact=Grizzly%20Bears');
});
