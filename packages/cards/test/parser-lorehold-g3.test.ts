// The Lorehold Spirit deck (issue 86), group 3 (D-622 and later, provisional): the lines of Naktamun Lorespinner // Wheel of Fortune. The real lines are the Oracle text of the acceptance card
// of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-lorehold-g3.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const read = (text: string, type: Type = 'sorcery') => readFace(text, type);
const readAll = (text: string, type: Type = 'sorcery') => readAllFace(text, type);

const NOT_READ = (text: string, type: Type = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeFalsy();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const EACH_PLAYER = { kind: 'eachPlayer' } as const;
const PREPARE = { kind: 'prepare', objects: { kind: 'this' } } as const;
const atMost = (value: number) => ({ cmp: 'atMost', value }) as const;

describe('"At the beginning of your upkeep, if a player has one or fewer cards in hand, ~ becomes prepared" (CR 402.1, 603.4, 722.3a)', () => {
  test('the real text of Naktamun Lorespinner, with its reminder text', () => {
    expect(
      readAll(
        "At the beginning of your upkeep, if a player has one or fewer cards in hand, ~ becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: { kind: 'aPlayerCardsInHand', compare: atMost(1) },
        effect: PREPARE,
      },
    ]);
  });

  test('without the reminder text', () => {
    expect(
      readAll(
        'At the beginning of your upkeep, if a player has one or fewer cards in hand, ~ becomes prepared.',
        'creature',
      ).abilities,
    ).toMatchObject([{ interveningIf: { kind: 'aPlayerCardsInHand', compare: atMost(1) } }]);
  });

  test('another number and another effect (SYNTHETIC)', () => {
    expect(
      readAll(
        'At the beginning of your upkeep, if a player has three or fewer cards in hand, you draw a card.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: { kind: 'aPlayerCardsInHand', compare: atMost(3) },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('at each upkeep (SYNTHETIC)', () => {
    expect(
      readAll(
        'At the beginning of each upkeep, if a player has one or fewer cards in hand, you gain 1 life.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        trigger: { kind: 'upkeep', whose: 'each' },
        interveningIf: { kind: 'aPlayerCardsInHand', compare: atMost(1) },
      },
    ]);
  });

  test.each([
    'At the beginning of your upkeep, if an opponent has one or fewer cards in hand, ~ becomes prepared.',
    'At the beginning of your upkeep, if each player has one or fewer cards in hand, ~ becomes prepared.',
    'At the beginning of your upkeep, if a player has one or more cards in hand, ~ becomes prepared.',
    'At the beginning of your upkeep, if a player has no cards in hand, ~ becomes prepared.',
    'At the beginning of your upkeep, if a player has one or fewer cards, ~ becomes prepared.',
    'At the beginning of your upkeep, if a player has fewer cards in hand, ~ becomes prepared.',
    'At the beginning of your upkeep, if a player has one or fewer cards in their hand, ~ becomes prepared.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"Each player discards their hand, then draws seven cards" (CR 701.9a, 121.1, 608.2c)', () => {
  test('the real text of Wheel of Fortune: every hand is discarded, then every player draws seven', () => {
    expect(readAll('Each player discards their hand, then draws seven cards.').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'discard', player: EACH_PLAYER, count: 0, hand: true },
          { kind: 'draw', player: EACH_PLAYER, count: 7 },
        ],
      },
    });
  });

  test('the discard alone (SYNTHETIC)', () => {
    expect(readAll('Each player discards their hand.').spell).toEqual({
      effect: { kind: 'discard', player: EACH_PLAYER, count: 0, hand: true },
    });
  });

  test('another number of cards (SYNTHETIC)', () => {
    expect(readAll('Each player discards their hand, then draws three cards.').spell).toMatchObject(
      {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'discard', hand: true },
            { kind: 'draw', count: 3 },
          ],
        },
      },
    );
  });

  test('a target opponent (SYNTHETIC)', () => {
    expect(readAll('Target opponent discards their hand.').spell).toMatchObject({
      effect: { kind: 'discard', count: 0, hand: true },
    });
  });

  test('"discard your hand" with no subject is still the controller’s own hand', () => {
    expect(readAll('Discard your hand, then draw seven cards.').spell).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'discard', player: { kind: 'you' } },
          { kind: 'draw', player: { kind: 'you' }, count: 7 },
        ],
      },
    });
  });

  test.each([
    'You discard their hand.',
    'Each player discards your hand.',
    'Each player discards their hands.',
    'Each player discards its hand.',
    'Each player discards the hand.',
    'Each player discards their hand, then draws.',
  ])('not read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });
});
