/** Issue 32: a token that is a copy of a card is drawn with the art of that card (no token card of its own exists on Scryfall). */
import type { TokenDefinition } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Art } from '../src/ui/board/art';

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
