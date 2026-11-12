// Stock Up (issue 25, D-960, CR 401.2, 401.4, 701.20a): the REAL card of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read through the grammar
// only, defined in an engine scenario and played through applyAction. "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of
// your library in any order." The cards that stand in for the library are real engine fixtures.
import { readFileSync } from 'node:fs';
import { getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { splitSentences } from '../src/convert/parser';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const golden = cards.find((c) => c.name === 'Stock Up');
if (golden === undefined) throw new Error('Stock Up is not in the golden corpus');
const STOCK = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const TEXT =
  'Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.';

const LABELS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];

describe('the card reads', () => {
  test('as supported, with nothing left unparsed, and validateCard is clean', () => {
    expect(golden.faces[0]?.oracleText).toBe(TEXT);
    expect(STOCK.support.status).toBe('supported');
    expect(STOCK.support.unparsed).toEqual([]);
    expect(STOCK.support.reasons).toEqual([]);
    expect(validateCard(STOCK.definition)).toEqual([]);
  });

  test('as one lookAtTop: five cards, two put into the hand unrevealed, the rest on the bottom in a chosen order', () => {
    expect(STOCK.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAtTop',
      count: 5,
      take: { filter: {}, max: 2, min: 2, hidden: true },
      rest: 'bottomChosen',
    });
  });

  test('the two sentences are kept together by the sentence splitter', () => {
    expect(splitSentences(TEXT, 0, TEXT.length)).toEqual([{ start: 0, end: TEXT.length }]);
  });
});

describe('a different wording is not read (a card is supported or unsupported, never partly)', () => {
  const read = (text: string) =>
    importCard(
      fromGoldenCard({
        ...golden,
        faces: [{ ...(golden.faces[0] ?? ({} as never)), oracleText: text }],
      }),
      undefined,
      NO_OVERRIDES,
    );

  test.each([
    [
      'the order is random (another rule, which reveals nothing it does not say)',
      'Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in a random order.',
    ],
    [
      'no order is said',
      'Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library.',
    ],
    [
      'the rest go to the graveyard',
      'Look at the top five cards of your library. Put two of them into your hand and the rest into your graveyard.',
    ],
    [
      'the whole of the cards looked at is taken',
      'Look at the top five cards of your library. Put five of them into your hand and the rest on the bottom of your library in any order.',
    ],
    ['the second sentence is missing', 'Look at the top five cards of your library.'],
  ])('%s', (_name, text) => {
    expect(read(text).support.status).toBe('unsupported');
  });
});

describe('Stock Up played in a game', () => {
  const game = (top: readonly string[] = TOP, fill = 3) => {
    const b = scenario().define(STOCK.definition).seat(0).hand(STOCK.definition.name);
    b.battlefield('Island', 'Island', 'Island');
    for (const [i, name] of top.entries()) b.library(name, { label: LABELS[i] ?? `x${i}` });
    for (let i = 0; i < fill; i++) b.library('Island', { label: `z${i}` });
    return b
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('two of the five go to the hand, the owner orders the rest on the bottom, below the cards never looked at', () => {
    const g = game();
    g.act(0).cast(STOCK.definition.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('b', 'e');
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Sol Ring', 'hand', { seat: 0 });
    g.expect.pending('arrangeCards', 0);
    expect(getView(g.state, 0).pendingCards?.map((o) => o.name)).toEqual([
      'Grizzly Bears',
      'Serra Angel',
      'Lightning Bolt',
    ]);
    g.act(0).arrange({ top: [], other: ['d', 'a', 'c'] });
    expect(g.state.seats[0]?.library).toEqual(
      ['z0', 'z1', 'z2', 'd', 'a', 'c'].map((l) => g.id(l)),
    );
    g.expect.zone(STOCK.definition.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the opponent is told that a look is going on, never which cards', () => {
    const g = game();
    g.act(0).cast(STOCK.definition.name, { pay: true });
    g.passAll();
    const view = getView(g.state, 1);
    expect(view.pendingCards).toBeUndefined();
    expect(view.waitingOn?.purpose).toBe('lookTake');
    g.act(0).chooseCards('a', 'b');
    expect(getView(g.state, 1).waitingOn?.purpose).toBe('bottom');
    g.act(0).arrange({ top: [], other: ['c', 'd', 'e'] });
    const text = JSON.stringify(getView(g.state, 1));
    for (const name of TOP) expect(text, name).not.toContain(name);
    g.expect.handSize(0, 2);
  });

  test('a library of four cards: two taken, two arranged', () => {
    const g = game(TOP.slice(0, 4), 0);
    g.act(0).cast(STOCK.definition.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('a', 'd');
    g.act(0).arrange({ top: [], other: ['c', 'b'] });
    expect(g.state.seats[0]?.library).toEqual(['c', 'b'].map((l) => g.id(l)));
  });

  test('a library of two cards: both are taken, nothing is asked', () => {
    const g = game(TOP.slice(0, 2), 0);
    g.act(0).cast(STOCK.definition.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 0);
    g.expect.hasLost(0, false);
  });
});
