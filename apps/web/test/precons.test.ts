import { validateCard } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { deckFor, HIDDEN_DECKS, isHiddenDeckId, preconById } from '../src/game/precons';

test.each(HIDDEN_DECKS.map((p) => [p.id, p] as const))(
  '%s is 100 supported cards',
  (_id, precon) => {
    const deck = deckFor(precon);
    expect(deck.cards).toHaveLength(100);
    expect(deck.commanders).toEqual([0]);
    for (const card of deck.cards) expect(validateCard(card), card.name).toEqual([]);
  },
);

test('the real-card test decks are hidden decks, reachable by id only (D-137)', () => {
  for (const id of ['white-knights', 'swamp-forest', 'instants']) {
    expect(isHiddenDeckId(id)).toBe(true);
    expect(preconById(id).id).toBe(id);
  }
  expect(isHiddenDeckId('zombies')).toBe(false);
  expect(() => preconById('zombies')).toThrow(/Unknown hidden test deck: zombies/);
});

test('the invented cards of the synthetic hidden decks are marked SYNTHETIC', () => {
  const synthetic = HIDDEN_DECKS.filter((deck) => deck.id.startsWith('synthetic-'));
  expect(synthetic.length).toBeGreaterThan(0);
  for (const hidden of synthetic) {
    expect(hidden.name).toContain('SYNTHETIC');
    const invented = deckFor(hidden).cards.filter((c) => c.name.startsWith('SYNTHETIC '));
    expect(invented.length).toBeGreaterThan(0);
    for (const card of invented) expect(card.oracleId).toBeNull();
  }
  expect(new Set(HIDDEN_DECKS.map((deck) => deck.id)).size).toBe(HIDDEN_DECKS.length);
});
