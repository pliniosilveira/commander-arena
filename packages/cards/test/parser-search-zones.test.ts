// Gate to the Afterlife (issue 104): "Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield. If you search your library this
// way, shuffle. Activate only if there are six or more creature cards in your graveyard." (CR 701.23a, 701.23b, 602.5b). The first lines are the real Oracle text; the others are
// SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-search-zones.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { readAll, read as readFace, withoutFeature } from './parser-p5-helpers';

const read = (text: string) => readFace(text, 'artifact');

const COST = '{2}, {T}, Sacrifice this artifact: ';
const SEARCH =
  "Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield.";
const SHUFFLE = 'If you search your library this way, shuffle.';
const RESTRICTION = 'Activate only if there are six or more creature cards in your graveyard.';
const LINE = `${COST}${SEARCH} ${SHUFFLE} ${RESTRICTION}`;

const SEARCH_NODE = {
  kind: 'search',
  player: { kind: 'you' },
  filter: { named: "God-Pharaoh's Gift" },
  max: 1,
  zones: ['graveyard', 'hand', 'library'],
  destinations: [{ zone: 'battlefield', count: 1 }],
  reveal: false,
  shuffle: false,
};

describe('Gate to the Afterlife: a search of the graveyard, the hand and/or the library for a card named', () => {
  test('the real line: the search, the shuffle only if the library was searched, and the restriction', () => {
    expect(readAll(LINE, 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'sequence',
          effects: [
            SEARCH_NODE,
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: { kind: 'you' } },
            },
          ],
        },
        activateOnlyIf: {
          kind: 'amountIs',
          amount: {
            kind: 'countOf',
            filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
          },
          compare: { cmp: 'atLeast', value: 6 },
        },
      },
    ]);
  });

  test('two zones, and a name with a comma (SYNTHETIC)', () => {
    expect(
      readAll(
        `${COST}Search your hand and/or library for a card named Regna, the Redeemer and put it onto the battlefield.`,
        'artifact',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'search',
          filter: { named: 'Regna, the Redeemer' },
          zones: ['hand', 'library'],
        },
      },
    ]);
  });

  test('a card of a given name in the library alone (SYNTHETIC)', () => {
    expect(
      readAll(
        `${COST}Search your library for a card named Regna, the Redeemer and put it onto the battlefield.`,
        'artifact',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'activated',
        effect: { kind: 'search', filter: { named: 'Regna, the Redeemer' }, shuffle: false },
      },
    ]);
  });

  test.each([
    `${COST}Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift, put it onto the battlefield, then shuffle.`,
    `${COST}Search your graveyard, hand, and/or library for a card named God-Pharaoh's Gift, reveal it, then put it onto the battlefield.`,
    `${COST}Search your graveyard, hand, and library for a card named God-Pharaoh's Gift and put it onto the battlefield.`,
    `${COST}Search your graveyard, hand, and/or library for up to two cards named God-Pharaoh's Gift and put them onto the battlefield.`,
    `${COST}Search your graveyard, hand, and/or library for a creature card named God-Pharaoh's Gift and put it onto the battlefield.`,
    `${COST}Search their graveyard, hand, and/or library for a card named God-Pharaoh's Gift and put it onto the battlefield.`,
    `${COST}Search your library for a card named and put it onto the battlefield.`,
  ])('near misses are not read, never half read: %s', (text) => {
    const parsed = read(text);
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:searchZones', LINE, 'artifact');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:searchZones');
    expect(DECLARED_NEEDS).toContain('selector:searchZones');
  });

  test('a card of a given name names the selector the engine lacks', () => {
    const missing = withoutFeature(
      'selector:named',
      `${COST}Search your library for a card named Regna, the Redeemer and put it onto the battlefield.`,
      'artifact',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:named');
  });
});
