// The World Shaper deck: the lines of Augur of Autumn, Evendo Brushrazer, Exploration Broodship and Szarel, Genesis Shepherd that no rule read before (the names replaced by ~ where
// they said their own), and near misses the grammar must not read. The engine runs what is lowered in packages/engine/test/scenario-xx-sacrifice-plays.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

describe('the four real cards of the golden corpus are supported', () => {
  const cards = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  );
  test.each([
    'Augur of Autumn',
    'Evendo Brushrazer',
    'Exploration Broodship',
    'Szarel, Genesis Shepherd',
  ])('%s', (name) => {
    const card = cards.find((c) => c.name === name);
    if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
    const { support } = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect({ status: support.status, unparsed: support.unparsed }).toEqual({
      status: 'supported',
      unparsed: [],
    });
  });
});

describe('Augur of Autumn: creature spells from the top of the library with three different powers', () => {
  test('the real line lowers to castFromTopOfLibrary with a count of different powers', () => {
    const parsed = readAll(
      'As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: { types: ['creature'] } },
        condition: {
          kind: 'amountIs',
          amount: {
            kind: 'differentPowersAmong',
            filter: { types: ['creature'], controller: 'you' },
          },
          compare: { cmp: 'atLeast', value: 3 },
        },
      },
    ]);
  });

  test('another count is read as it is', () => {
    const parsed = readAll(
      'As long as you control two or more creatures with different powers, you may cast creature spells from the top of your library.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({ condition: { compare: { value: 2 } } });
  });

  test('near misses are not read', () => {
    for (const text of [
      'As long as you control three or more creatures with the same power, you may cast creature spells from the top of your library.',
      'As long as you control three or more creatures with different toughnesses, you may cast creature spells from the top of your library.',
      'As long as you control three or more artifacts with different powers, you may cast creature spells from the top of your library.',
      'As long as an opponent controls three or more creatures with different powers, you may cast creature spells from the top of your library.',
    ]) {
      expect(dropped(text, 'creature').text, text).toBe(text);
    }
  });
});

describe('Evendo Brushrazer: playing the cards exiled with ~ after a sacrifice this turn', () => {
  const REAL =
    "Whenever you sacrifice a nontoken permanent, exile the top card of your library.\nDuring your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.";

  test('the real lines lower to a linked exile and a permission with its conditions', () => {
    const parsed = readAll(REAL, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'permanentSacrificed', by: 'you', filter: { token: false } },
        effect: { kind: 'exileTop', count: 1, linked: true },
      },
      {
        kind: 'static',
        static: { kind: 'playFromLinkedExile' },
        condition: {
          kind: 'and',
          terms: [{ kind: 'yourTurn' }, { kind: 'sacrificedThisTurn', token: false }],
        },
      },
    ]);
  });

  test('near misses are not read', () => {
    for (const text of [
      "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may cast cards exiled with ~.",
      "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play a card exiled with ~.",
      "As long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~.",
      'During your turn, as long as an opponent has sacrificed a nontoken permanent this turn, you may play cards exiled with ~.',
    ]) {
      expect(dropped(text, 'creature').text, text).toBe(text);
    }
  });
});

describe('Exploration Broodship: a permanent spell from the graveyard by sacrificing a land', () => {
  test('the real line lowers to playFromGraveyardOnceEachTurn with a sacrifice', () => {
    const parsed = readAll(
      'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          cast: {
            anyOf: [
              { types: ['artifact'] },
              { types: ['creature'] },
              { types: ['enchantment'] },
              { types: ['planeswalker'] },
              { types: ['battle'] },
            ],
          },
          sacrifice: { types: ['land'] },
        },
      },
    ]);
  });

  test('near misses are not read', () => {
    for (const text of [
      'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land.',
      'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a creature in addition to paying its other costs.',
      'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing two lands in addition to paying its other costs.',
    ]) {
      expect(dropped(text, 'artifact').text, text).toBe(text);
    }
  });
});

describe('Szarel, Genesis Shepherd: another nontoken permanent sacrificed during your turn', () => {
  test('the real line lowers to a sacrifice trigger with the turn and the counters of the power of the source', () => {
    const parsed = readAll(
      "Whenever you sacrifice another nontoken permanent during your turn, put a number of +1/+1 counters equal to ~'s power on up to one other target creature.",
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'permanentSacrificed',
          by: 'you',
          filter: { token: false, other: true },
          duringTurn: 'you',
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], other: true },
            },
            min: 0,
            max: 1,
          },
        ],
        effect: {
          kind: 'addCounters',
          objects: { kind: 'target', id: 't1' },
          counter: '+1/+1',
          count: { kind: 'powerOf', of: { kind: 'this' } },
        },
      },
    ]);
  });

  test('another turn is not read', () => {
    for (const text of [
      "Whenever you sacrifice another nontoken permanent during their turn, put a number of +1/+1 counters equal to ~'s power on up to one other target creature.",
      "Whenever you sacrifice another nontoken permanent during your turns, put a number of +1/+1 counters equal to ~'s power on up to one other target creature.",
    ]) {
      expect(dropped(text, 'creature').text, text).toBe(text);
    }
  });
});
