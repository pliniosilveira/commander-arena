import { readFileSync } from 'node:fs';
import { canonicalDeck, parseDecklist } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { buildPreconDeck, createPrecons, deckChoices, SHIPPED } from '../src/precons';
import { serviceFor } from './precons-helpers';

const id = 'witherbloom-pestilence';

function witherbloom() {
  const snapshot = SHIPPED.snapshots.find((deck) => deck.id === id);
  if (snapshot === undefined) throw new Error('The Witherbloom Pestilence precon is not shipped.');
  return snapshot;
}

test('Witherbloom Pestilence ships the exact supplied 100-card list and real card data', () => {
  const snapshot = witherbloom();
  const source = readFileSync(
    new URL('../../../decks/precon-witherbloom-pestilence.txt', import.meta.url),
    'utf8',
  );
  expect(snapshot.decklist).toBe(source);
  const parsed = parseDecklist(snapshot.decklist);
  expect(parsed.errors).toEqual([]);
  const deck = canonicalDeck(parsed);
  expect(deck.commander).toMatchObject([{ name: 'Dina, Essence Brewer', count: 1 }]);
  expect([...deck.commander, ...deck.main].reduce((total, line) => total + line.count, 0)).toBe(
    100,
  );
  expect(snapshot.cards).toHaveLength(86);
  for (const card of snapshot.cards) {
    expect(card.oracleId, card.name).toMatch(/^[a-f0-9-]{36}$/);
    expect(card.scryfallId, card.name).toMatch(/^[a-f0-9-]{36}$/);
    for (const face of card.faces) {
      expect(face.typeLine, card.name).not.toBe('');
      expect(face.artist, card.name).toBeTruthy();
      expect(face.imageUris?.normal, card.name).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    }
  }
  expect(snapshot.cards.find((card) => card.name === 'Dina, Essence Brewer')).toMatchObject({
    cmc: 3,
    colorIdentity: ['B', 'G'],
    commanderLegality: 'legal',
    faces: [expect.objectContaining({ manaCost: '{1}{B}{G}', power: '2', toughness: '3' })],
  });
  expect(
    snapshot.cards.find((card) => card.name === 'Eccentric Pestfinder // Turn Stones')?.faces,
  ).toHaveLength(2);
  expect(
    snapshot.cards.find((card) => card.name === 'Stensian Sanguinist // Exsanguinate')?.faces,
  ).toHaveLength(2);
});

test('the shipped Witherbloom precon is an available built-in choice with its commander', () => {
  const precons = createPrecons(SHIPPED.snapshots, serviceFor);
  expect(deckChoices(precons.list, [], []).find((deck) => deck.id === id)).toMatchObject({
    name: 'Witherbloom Pestilence',
    commander: 'Dina, Essence Brewer',
    kind: 'precon',
    edited: false,
  });
});

test('Witherbloom Pestilence builds offline as a legal, fully supported Commander deck', async () => {
  const result = await buildPreconDeck(witherbloom(), serviceFor);
  if (!result.ok) throw new Error(result.reason);
  expect(result.deck.cards).toHaveLength(100);
  expect(result.deck.commanders).toEqual([0]);
  expect(result.deck.cards[0]?.name).toBe('Dina, Essence Brewer');
  expect(result.deck.cards.every((card) => card.support === 'supported')).toBe(true);
  const started = await new GameHost({ clock: () => 0 }).newGame({
    seed: 58,
    humanDeck: id,
    aiDeck: id,
    humanCards: result.deck,
    aiCards: result.deck,
  });
  expect(started.summary.unsupported).toEqual([]);
  expect(started.snapshot.error).toBeNull();
});
