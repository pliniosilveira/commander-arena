// Espers to Magicite (deck-support issue 97): "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that
// card, except it's an artifact and it loses all other card types." The first line is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the
// other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-espers.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const REAL =
  "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.";

const EXILE_EACH = {
  kind: 'exile',
  objects: {
    kind: 'each',
    filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } },
  },
};

const slot = (types: readonly string[]) => ({
  id: 't1',
  what: { kind: 'object', filter: { zone: 'exile', types, exiledThisWay: true } },
  min: 0,
  max: 1,
});

describe('Espers to Magicite (CR 603.12, 707.9b, 400.7j)', () => {
  test('the real text: the exile, and a reflexive ability that carries the cards with a slot for the cards exiled this way', () => {
    expect(readAll(REAL, 'instant').spell).toEqual({
      effect: {
        kind: 'sequence',
        effects: [
          EXILE_EACH,
          {
            kind: 'reflexive',
            targets: [slot(['creature'])],
            effect: {
              kind: 'createToken',
              token: {
                kind: 'copyOf',
                object: { kind: 'target', id: 't1' },
                setTypes: ['artifact'],
              },
              count: 1,
            },
            carriesMoved: true,
            ifMoved: true,
          },
        ],
      },
    });
  });

  test('another card type, as a sorcery (SYNTHETIC)', () => {
    const parsed = readAll(
      "Exile each opponent's graveyard. When you do, choose up to one target artifact card exiled this way. Create a token that's a copy of that card, except it's an enchantment and it loses all other card types.",
      'sorcery',
    );
    expect(JSON.stringify(parsed.spell)).toContain('"types":["artifact"],"exiledThisWay":true');
    expect(JSON.stringify(parsed.spell)).toContain('"setTypes":["enchantment"]');
  });

  test.each([
    // The target is not a card exiled this way.
    "Exile each opponent's graveyard. When you do, choose up to one target creature card in a graveyard. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.",
    // More than one target.
    "Exile each opponent's graveyard. When you do, choose up to two target creature cards exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.",
    // "You may" makes the exile an offer: another shape.
    "You may exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.",
    // The copy keeps its card types: not the exception of the text.
    "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact.",
    // A reflexive ability after something that is not an exile of a graveyard.
    "Draw a card. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.",
  ])('a near miss is not read: %s', (text) => {
    const parsed = read(text, 'instant');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
  });

  const CASES = [
    ['ability:reflexiveIfMoved', REAL, 'instant'],
    ['token:copyExceptions', REAL, 'instant'],
    ['selector:exiledThisWay', REAL, 'instant'],
    ['effect:reflexive', REAL, 'instant'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    for (const ref of ['effect:exile', 'selector:each'] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
