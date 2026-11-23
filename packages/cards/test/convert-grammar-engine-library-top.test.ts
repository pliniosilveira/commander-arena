// Cavalier of Thorns, Cream of the Crop and Risen Reef (Dance of the Elements deck, issue 92; CR 401.2, 401.4, 608.2c, 701.20a): the REAL cards of the golden corpus (real Oracle text,
// `fixtures/corpus/golden.jsonl`) read through the grammar only, defined in an engine scenario and played through applyAction. The cards that stand in for the library are real
// engine fixtures.
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
function real(name: string) {
  const golden = cards.find((c) => c.name === name);
  if (golden === undefined) throw new Error(`${name} is not in the golden corpus`);
  return { golden, card: importCard(fromGoldenCard(golden), undefined, NO_OVERRIDES) };
}
const CAVALIER = real('Cavalier of Thorns');
const CREAM = real('Cream of the Crop');
const REEF = real('Risen Reef');

const readText = (base: GoldenCard, text: string) =>
  importCard(
    fromGoldenCard({
      ...base,
      faces: [{ ...(base.faces[0] ?? ({} as never)), oracleText: text }],
    }),
    undefined,
    NO_OVERRIDES,
  );

describe('the cards read', () => {
  test.each([
    ['Cavalier of Thorns', CAVALIER],
    ['Cream of the Crop', CREAM],
    ['Risen Reef', REEF],
  ])('%s is supported, with nothing left unparsed, and validateCard is clean', (_n, c) => {
    expect(c.card.support.status).toBe('supported');
    expect(c.card.support.unparsed).toEqual([]);
    expect(validateCard(c.card.definition)).toEqual([]);
  });

  test('Cavalier of Thorns: a reveal of five, a land card put onto the battlefield, the rest into the graveyard', () => {
    const ability = CAVALIER.card.definition.faces[0]?.abilities?.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'entersBattlefield',
    );
    expect(ability).toMatchObject({
      effect: {
        kind: 'lookAtTop',
        count: 5,
        revealAll: true,
        take: { filter: { types: ['land'] }, max: 1, min: 1, to: 'battlefield' },
        rest: 'graveyard',
      },
    });
  });

  test("Cream of the Crop: the count is the entering creature's power, one stays on top, the rest go to the bottom in a chosen order", () => {
    expect(CREAM.card.definition.faces[0]?.abilities?.[0]).toMatchObject({
      kind: 'triggered',
      optional: true,
      effect: {
        kind: 'lookAtTop',
        count: { kind: 'powerOf', of: { kind: 'triggerSubject' } },
        take: { filter: {}, max: 1, min: 1, to: 'top', hidden: true },
        rest: 'bottomChosen',
      },
    });
  });

  test('Risen Reef: one trigger for itself and one for another Elemental, each a land card put tapped or else into the hand', () => {
    const triggers = (REEF.card.definition.faces[0]?.abilities ?? []).filter(
      (a) => a.kind === 'triggered',
    );
    expect(triggers.map((t) => (t.kind === 'triggered' ? t.trigger : null))).toEqual([
      { kind: 'entersBattlefield', what: { kind: 'this' } },
      {
        kind: 'entersBattlefield',
        what: { subtypes: ['Elemental'], other: true, controller: 'you' },
      },
    ]);
    for (const t of triggers) {
      expect(t).toMatchObject({
        effect: {
          kind: 'lookAtTop',
          count: 1,
          take: {
            filter: { types: ['land'] },
            max: 1,
            to: 'battlefield',
            tapped: true,
            hidden: true,
            elseAnyToHand: true,
          },
        },
      });
    }
  });

  test('the sentences are kept together by the sentence splitter', () => {
    for (const text of [
      'Reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard.',
      "Look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest on the bottom of your library in any order.",
      "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand.",
    ]) {
      expect(splitSentences(text, 0, text.length)).toEqual([{ start: 0, end: text.length }]);
    }
  });
});

describe('a different wording is not read (a card is supported or unsupported, never partly)', () => {
  test.each([
    [
      'the land card is optional',
      CAVALIER,
      'When this creature enters, reveal the top five cards of your library. You may put a land card from among them onto the battlefield and the rest into your graveyard.',
    ],
    [
      'the rest go on the bottom',
      CAVALIER,
      'When this creature enters, reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest on the bottom of your library in a random order.',
    ],
    [
      'two cards are kept on top',
      CREAM,
      "Whenever a creature you control enters, you may look at the top X cards of your library, where X is that creature's power. If you do, put two of those cards on top of your library and the rest on the bottom of your library in any order.",
    ],
    [
      'the rest go into the graveyard',
      CREAM,
      "Whenever a creature you control enters, you may look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest into your graveyard.",
    ],
    [
      'the land is put untapped',
      REEF,
      "Whenever this creature enters, look at the top card of your library. If it's a land card, you may put it onto the battlefield. If you don't put the card onto the battlefield, put it into your hand.",
    ],
    [
      'the card is put on the bottom instead of into the hand',
      REEF,
      "Whenever this creature enters, look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it on the bottom of your library.",
    ],
  ])('%s', (_name, base, text) => {
    expect(readText(base.golden, text).support.status).toBe('unsupported');
  });
});

describe('Cavalier of Thorns played in a game', () => {
  const game = (top: readonly string[]) => {
    const b = scenario().define(CAVALIER.card.definition).seat(0).hand(CAVALIER.golden.name);
    b.battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest');
    for (const [i, name] of top.entries()) b.library(name, { label: `l${i}` });
    return b.seat(1).library('Island').at('precombatMain', { active: 0, turn: 1 }).build();
  };
  const cast = (g: ReturnType<typeof game>) => {
    g.act(0).cast(CAVALIER.golden.name, { pay: true });
    g.passAll();
  };

  test('every card is revealed, the land chosen enters untapped, the rest go into the graveyard', () => {
    const g = game(['Grizzly Bears', 'Island', 'Serra Angel', 'Mountain', 'Lightning Bolt']);
    cast(g);
    g.expect.pending('chooseCards', 0);
    expect(getView(g.state, 1).pendingCards).toBeUndefined();
    g.act(0).chooseCards('l3');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with no land among the cards they all go into the graveyard and nobody is asked', () => {
    const g = game(['Grizzly Bears', 'Serra Angel', 'Lightning Bolt', 'Sol Ring', 'Giant Spider']);
    cast(g);
    g.expect.pending('priority', 0);
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 0);
    g.expect.invariants();
  });
});

describe('Cream of the Crop played in a game', () => {
  const game = (top: readonly string[]) => {
    const b = scenario()
      .define(CREAM.card.definition)
      .seat(0)
      .battlefield(CREAM.golden.name, 'Forest', 'Forest')
      .hand('Grizzly Bears');
    for (const [i, name] of top.entries()) b.library(name, { label: `l${i}` });
    return b.seat(1).library('Island').at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test("looks at as many cards as the creature's power, keeps one on top and puts the rest on the bottom", () => {
    const g = game(['Island', 'Serra Angel', 'Lightning Bolt', 'Sol Ring']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    // The trigger is optional: the controller says yes.
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    expect(getView(g.state, 0).pendingCards?.map((o) => o.name)).toEqual(['Island', 'Serra Angel']);
    g.act(0).chooseCards('l1');
    expect(g.state.seats[0]?.library).toEqual(['l1', 'l2', 'l3', 'l0'].map((l) => g.id(l)));
    g.expect.invariants();
  });

  test('declining the look changes nothing', () => {
    const g = game(['Island', 'Serra Angel', 'Lightning Bolt']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(g.state.seats[0]?.library).toEqual(['l0', 'l1', 'l2'].map((l) => g.id(l)));
    g.expect.pending('priority', 0);
  });
});

describe('Risen Reef played in a game', () => {
  const game = (top: readonly string[]) => {
    const b = scenario()
      .define(REEF.card.definition)
      .seat(0)
      .hand(REEF.golden.name)
      .battlefield('Forest', 'Island', 'Island');
    for (const [i, name] of top.entries()) b.library(name, { label: `l${i}` });
    return b.seat(1).library('Island').at('precombatMain', { active: 0, turn: 1 }).build();
  };
  const cast = (g: ReturnType<typeof game>) => {
    g.act(0).cast(REEF.golden.name, { pay: true });
    g.passAll();
  };

  test('a land card may be put onto the battlefield tapped', () => {
    const g = game(['Mountain', 'Serra Angel']);
    cast(g);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('l0');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a land card that is not put onto the battlefield goes into the hand', () => {
    const g = game(['Mountain', 'Serra Angel']);
    cast(g);
    g.act(0).chooseCards();
    g.expect.zone('Mountain', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a card that is not a land card goes into the hand, unasked and unrevealed', () => {
    const g = game(['Serra Angel', 'Mountain']);
    cast(g);
    g.expect.pending('priority', 0);
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});
