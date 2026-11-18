// The First Flight starter Commander decks, Diluvian Primordial: "When this creature enters, for each opponent, you may cast up to one target instant or sorcery card from that
// player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead." (the real ability line; the card is in the golden
// corpus, and its whole text is played in convert-grammar-engine-first-flight-primordial.test.ts), SYNTHETIC siblings and the near misses the grammar must not read.
// Pins: CR 115.1 and 601.2c (one slot, at most one card of each opponent), CR 608.2g and 118.9 (cast during the resolution, without paying), CR 614.1a (exile instead).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { dropped, read } from './parser-p5-helpers';

const ETB = 'When this creature enters, ';
const SLOT = (types: readonly string[]) => ({
  id: 't1',
  what: {
    kind: 'object',
    filter: {
      zone: 'graveyard',
      controller: 'opponent',
      anyOf: types.map((t) => ({ types: [t] })),
    },
  },
  onePerOpponent: true,
});
const trigger = (types: readonly string[], exileInstead: boolean) => ({
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  targets: [SLOT(types)],
  effect: {
    kind: 'castCard',
    object: { kind: 'target', id: 't1' },
    free: true,
    ...(exileInstead ? { exileInstead: true } : {}),
  },
});

const REAL =
  "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead.";

const NOT_READ = (text: string) => {
  const parsed = read(text, 'creature');
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

describe('"for each opponent, you may cast up to one target instant or sorcery card from that player\'s graveyard without paying its mana cost" (CR 115.1, 601.2c, 608.2g, 118.9)', () => {
  test('the real line: one slot of up to one card for each opponent, cast free, exiled instead of a graveyard', () => {
    const parsed = read(`${ETB}${REAL}`, 'creature');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([trigger(['instant', 'sorcery'], true)]);
  });

  test('the same without the rider: the spell goes to the graveyard as any spell (SYNTHETIC)', () => {
    const parsed = read(
      `${ETB}for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost.`,
      'creature',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([trigger(['instant', 'sorcery'], false)]);
  });

  test('a sorcery only (SYNTHETIC)', () => {
    const parsed = read(
      `${ETB}for each opponent, you may cast up to one target sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead.`,
      'creature',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        ...trigger(['sorcery'], true),
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', controller: 'opponent', types: ['sorcery'] },
            },
            onePerOpponent: true,
          },
        ],
      },
    ]);
  });

  test('the engine feature it needs is named: without castCard the line is not supported', () => {
    BLOCKED.add('effect:castCard');
    try {
      const d = dropped(`${ETB}${REAL}`, 'creature');
      expect(d.reason).toBe('notRunnable');
    } finally {
      BLOCKED.delete('effect:castCard');
    }
  });

  test.each([
    // No "up to": each opponent would need a card.
    "for each opponent, you may cast target instant or sorcery card from that player's graveyard without paying its mana cost.",
    // Another count.
    "for each opponent, you may cast up to two target instant or sorcery cards from that player's graveyard without paying its mana cost.",
    // Not that player's graveyard.
    'for each opponent, you may cast up to one target instant or sorcery card from your graveyard without paying its mana cost.',
    'for each opponent, you may cast up to one target instant or sorcery card from a graveyard without paying its mana cost.',
    // Not each opponent.
    "for each player, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost.",
    // Not a choice, or not free.
    "for each opponent, cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost.",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard.",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard by paying its mana cost.",
    // Something else joined to the clause.
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost and draw a card.",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost this turn.",
    // Another rider.
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.",
    "for each opponent, you may cast up to one target instant or sorcery card from that player's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead, then draw a card.",
  ])('near miss: %s', (text) => NOT_READ(`${ETB}${text}`));
});
