// Fact or Fiction (issue 25, D-303, CR 700.3): the REAL card of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read through the grammar only,
// defined in an engine scenario and played through applyAction. Nothing here is written from a masked or invented wording. The other cards are real engine fixtures.
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
const golden = cards.find((c) => c.name === 'Fact or Fiction');
if (golden === undefined) throw new Error('Fact or Fiction is not in the golden corpus');
const FACT = importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES);
const TEXT =
  'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.';

const LABELS = ['a', 'b', 'c', 'd', 'e'] as const;
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'];

describe('the card reads', () => {
  test('as supported, with nothing left unparsed, and validateCard is clean', () => {
    expect(golden.faces[0]?.oracleText).toBe(TEXT);
    expect(FACT.support.status).toBe('supported');
    expect(FACT.support.unparsed).toEqual([]);
    expect(validateCard(FACT.definition)).toEqual([]);
  });

  test('as one revealAndSeparate: five cards, an opponent separates, the pile chosen goes to the hand and the other to the graveyard', () => {
    expect(FACT.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'revealAndSeparate',
      count: 5,
      separator: 'opponent',
      chosenTo: 'hand',
      otherTo: 'graveyard',
    });
  });

  test('the three sentences are kept together by the sentence splitter', () => {
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
      'one sentence missing',
      'Reveal the top five cards of your library. An opponent separates those cards into two piles.',
    ],
    [
      'another place for the other pile',
      'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your library.',
    ],
    [
      'the controller separates',
      'Reveal the top five cards of your library. You separate those cards into two piles. Put one pile into your hand and the other into your graveyard.',
    ],
  ])('%s', (_name, text) => {
    expect(read(text).support.status).toBe('unsupported');
  });
});

describe('Fact or Fiction played in a game', () => {
  const game = (top: readonly string[] = TOP, fill = 5) => {
    const b = scenario()
      .define(FACT.definition)
      .seat(0)
      .hand(FACT.definition.name)
      .battlefield('Island', 'Island', 'Island', 'Island');
    for (const [i, name] of top.entries()) b.library(name, { label: LABELS[i] ?? `x${i}` });
    for (let i = 0; i < fill; i++) b.library('Island');
    return b
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('an opponent separates, the controller takes a pile into the hand and the other goes to the graveyard', () => {
    const g = game();
    g.act(0).cast(FACT.definition.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 1);
    // The cards are public and still in the library while they are separated (CR 700.3c).
    expect(getView(g.state, 1).pendingCards?.map((o) => o.name)).toEqual(TOP);
    g.expect.librarySize(0, 10);
    g.act(1).chooseCards('a', 'b');
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('pile2');
    for (const name of ['Serra Angel', 'Lightning Bolt', 'Sol Ring']) {
      g.expect.zone(name, 'hand', { seat: 0 });
    }
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone(FACT.definition.name, 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 5);
    g.expect.invariants();
  });

  test('either pile may be empty (CR 700.3d)', () => {
    const g = game();
    g.act(0).cast(FACT.definition.name, { pay: true });
    g.passAll();
    g.act(1).chooseCards();
    g.act(0).chooseOption('pile2');
    g.expect.handSize(0, 5);
  });

  test('a library of two cards is sorted whole: only those two are revealed', () => {
    const g = game(TOP.slice(0, 2), 0);
    g.act(0).cast(FACT.definition.name, { pay: true });
    g.passAll();
    expect(getView(g.state, 1).pendingCards?.map((o) => o.name)).toEqual(TOP.slice(0, 2));
    g.act(1).chooseCards('a');
    g.act(0).chooseOption('pile1');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.hasLost(0, false);
  });

  test('an empty library asks nothing and does not lose the game for it', () => {
    const g = game([], 0);
    g.act(0).cast(FACT.definition.name, { pay: true });
    g.passAll();
    g.expect.pending('priority' as never);
    g.expect.zone(FACT.definition.name, 'graveyard', { seat: 0 });
    g.expect.hasLost(0, false);
  });
});
