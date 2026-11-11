import { expect, test } from 'vitest';
import { deckFor, HIDDEN_DECKS } from '../src/game/precons';
import { isSyntheticFace, SYNTHETIC_FACE_NAMES } from '../src/game/synthetic-names';

/** The faces of every SYNTHETIC multi-face card of the hidden decks, sorted. */
function derivedFaceNames(): string[] {
  const found = new Set<string>();
  for (const deck of HIDDEN_DECKS) {
    for (const card of deckFor(deck).cards) {
      if (card.name.startsWith('SYNTHETIC ') && card.faces.length > 1) {
        for (const face of card.faces) found.add(face.name);
      }
    }
  }
  return [...found].sort();
}

test('the written-out face names are exactly the ones the hidden decks hold', () => {
  expect([...SYNTHETIC_FACE_NAMES]).toEqual(derivedFaceNames());
});

test('an invented face is recognised and a real card name is not', () => {
  expect(isSyntheticFace('Brawler Bear')).toBe(true);
  expect(isSyntheticFace('Plains')).toBe(false);
  expect(isSyntheticFace('Serra Angel')).toBe(false);
});
