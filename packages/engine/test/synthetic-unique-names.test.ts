// Two fixture lists written apart must not give one SYNTHETIC name to two different cards: `SYNTHETIC_CARDS` is keyed by name, so
// the later card silently replaces the earlier one and the earlier list's tests see the wrong card (a clash of "Quiet Bear" once did).
import { describe, expect, test } from 'vitest';
import { SYNTHETIC_ALL_LIST } from '../src/cards/fixtures/synthetic';

// Clashes that predate this guard (two lists define the card differently; the later one has always been the one in use, and renaming it would move old
// games). A new clash must not be added here: rename the new card.
const OLD_CLASHES: readonly string[] = ['SYNTHETIC Wither Imp'];

describe('SYNTHETIC fixtures', () => {
  test('a name belongs to one card only', () => {
    const seen = new Map<string, unknown>();
    const clashes: string[] = [];
    for (const card of SYNTHETIC_ALL_LIST) {
      const earlier = seen.get(card.name);
      if (earlier !== undefined && earlier !== card && !OLD_CLASHES.includes(card.name))
        clashes.push(card.name);
      seen.set(card.name, card);
    }
    expect(clashes).toEqual([]);
  });
});
