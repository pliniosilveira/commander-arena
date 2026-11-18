// The First Flight starter Commander decks, Gideon Jura (CR 508.1d, 611.2a, 611.2c): "+2: During target opponent's next turn, creatures that player controls attack ~ if able." The first
// line of the first block is the real Oracle text of the card (the golden corpus holds it; the name is written ~ as the grammar sees it); the others are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-first-flight-gideon.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DEFAULT_RULES, parseFaceText } from '../src/convert/parser/index';
import { OPTS } from './parser-p5-helpers';

const walker = (text: string) =>
  parseFaceText(text, OPTS, 0, DEFAULT_RULES, [], ['planeswalker'], ['Gideon']);

const magnet = (who: object) => ({
  kind: 'activated',
  cost: [{ kind: 'loyalty', change: 2 }],
  targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent', ...who } }],
  effect: {
    kind: 'requireAttackSource',
    player: { kind: 'target', id: 't1' },
    duration: 'untilEndOfTheirNextTurn',
  },
});

describe('"+2: During target opponent\'s next turn, creatures that player controls attack ~ if able." (Gideon Jura; CR 508.1d)', () => {
  test('the real line: a loyalty ability that requires the creatures of the chosen opponent to attack the planeswalker', () => {
    const parsed = walker(
      "+2: During target opponent's next turn, creatures that player controls attack ~ if able.",
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([magnet({})]);
  });

  test('other loyalty costs carry the same effect (SYNTHETIC)', () => {
    for (const [mark, change] of [
      ['0', 0],
      ['-1', -1],
    ] as const) {
      const parsed = walker(
        `${mark}: During target opponent's next turn, creatures that player controls attack ~ if able.`,
      );
      expect(parsed.unparsed, mark).toEqual([]);
      expect(parsed.abilities, mark).toMatchObject([
        { kind: 'activated', cost: [{ kind: 'loyalty', change }] },
      ]);
    }
  });

  test('any target player is read, and the typographic apostrophe (SYNTHETIC)', () => {
    const parsed = walker(
      '+1: During target player’s next turn, creatures that player controls attack ~ if able.',
    );
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toMatchObject([
      {
        targets: [{ what: { kind: 'player', filter: 'any' } }],
        effect: { kind: 'requireAttackSource' },
      },
    ]);
  });

  test.each([
    "+2: During target opponent's next turn, creatures that player controls attack ~.",
    "+2: During target opponent's next turn, creatures that player controls attack target creature if able.",
    "+2: During target opponent's next turn, creatures you control attack ~ if able.",
    "+2: During target opponent's next turn, creatures that player controls attack ~ each combat if able.",
    "+2: During target opponent's next turn, creature that player controls attacks ~ if able.",
    "+2: During target opponent's next turn, creatures that player controls attack ~ if able and you draw a card.",
    "+2: During each opponent's next turn, creatures that player controls attack ~ if able.",
    "+2: During target opponent's turn, creatures that player controls attack ~ if able.",
    "+2: Until target opponent's next turn, creatures that player controls attack ~ if able.",
  ])('near miss, dropped whole: %s', (text) => {
    const parsed = walker(text);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('a spell has no permanent to attack: the same words in a sorcery are not lowered', () => {
    const parsed = parseFaceText(
      "During target opponent's next turn, creatures that player controls attack ~ if able.",
      OPTS,
      0,
      DEFAULT_RULES,
      [],
      ['sorcery'],
      [],
    );
    expect(parsed.abilities).toEqual([]);
  });
});
