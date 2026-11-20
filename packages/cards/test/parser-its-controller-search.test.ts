// Regression (Sliver Swarm group A): "Its controller may search their library ..." after a destroy of a target keeps going down the search-by rule, while "Its controller may draw
// ..." (Synapse Sliver) is the player asked. The text is the real Oracle text of White Orchid Phantom, as committed in the Lorehold Spirit precon snapshot (CR 701.23a, 608.2d).
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const TEXT =
  'Flying, first strike\nWhen this creature enters, destroy up to one target nonbasic land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.';

describe('"Its controller may search their library" after a destroy', () => {
  test('White Orchid Phantom is supported', () => {
    const card = parsed('White Orchid Phantom', 'Creature — Spirit Knight', TEXT, {
      manaCost: '{W}{W}',
      power: '2',
      toughness: '2',
    });
    expect(JSON.stringify(card.faces[0]?.abilities)).toContain('"search"');
  });
});
