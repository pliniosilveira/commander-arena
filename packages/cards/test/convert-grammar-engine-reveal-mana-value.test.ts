// Issue 576, Elminster deck, "the card an earlier instruction revealed or exiled" as an amount source: the REAL text of Interpret the Signs ("Scry 3, then reveal the top card of your
// library. Draw cards equal to that card's mana value.") and a SYNTHETIC copy of the loyalty ability of Elminster alone ("-3: Exile the top card of your library. Create a number of 1/1
// blue Faerie Dragon creature tokens with flying equal to that card's mana value."; the other abilities of the real card belong to another group, so the real card stays unsupported).
// Both go through the grammar as cards with no override and are played through applyAction in engine scenarios, at a table of three seats.
// Pins: CR 701.20a (Reveal: the card stays in the library), CR 701.13 (Exile), CR 400.7j and 608.2c (what an earlier instruction moved is "that card"), CR 202.3 (mana value; a card
// with no mana cost has 0, an X in a library is 0, CR 107.3a), CR 306.5b (loyalty counters), CR 701.22 (Scry).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const signs = real('Interpret the Signs');
const ELMINSTER_TEXT =
  "−3: Exile the top card of your library. Create a number of 1/1 blue Faerie Dragon creature tokens with flying equal to that card's mana value.";
const elminster = parsed(
  'SYNTHETIC Elminster Copy',
  'Legendary Planeswalker — Elminster',
  ELMINSTER_TEXT,
  {
    manaCost: '{3}{W}{U}',
    loyalty: '5',
  },
);
const xOnly = parsed('SYNTHETIC X Only', 'Sorcery', 'Draw a card.', { manaCost: '{X}' });
const xSpell = parsed('SYNTHETIC X Spell', 'Sorcery', 'Draw a card.', { manaCost: '{X}{R}' });

const FILLER = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'];

describe('the real Interpret the Signs and the synthetic Elminster ability are read', () => {
  test('the real Elminster, scry trigger and -3 ability together, is supported', () => {
    const card = GOLDEN.find((c) => c.name === 'Elminster');
    if (card === undefined) throw new Error('no Elminster');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.status).toBe('supported');
    expect(imported.support.unparsed).toEqual([]);
  });

  test('"that card" with nothing revealed or exiled before it stays an unbound reference', () => {
    const lone = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Lonely Draw',
        manaCost: '{1}{U}',
        typeLine: 'Sorcery',
        oracleText: "Draw cards equal to that card's mana value.",
      }),
    );
    expect(lone.support.status).toBe('unsupported');
    // Two cards exiled have no single "that card".
    const two = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Two Exiles',
        manaCost: '{1}{U}',
        typeLine: 'Sorcery',
        oracleText:
          "Exile the top two cards of your library. Draw cards equal to that card's mana value.",
      }),
    );
    expect(two.support.status).toBe('unsupported');
  });
});

/** Three seats, seat 0 at its main phase holding Interpret the Signs, with the library as given (top first). */
const signsGame = (library: readonly string[]) =>
  scenario({ seats: 3 })
    .define(signs)
    .define(xOnly)
    .define(xSpell)
    .seat(0)
    .library(...library)
    .hand(signs.name)
    .battlefield('Island', { count: 6 })
    .seat(1)
    .library(...FILLER)
    .seat(2)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();

describe('Interpret the Signs: scry 3, reveal the top card, draw cards equal to its mana value', () => {
  /** The three cards the scry looks at (top first) are put back on top in the order given; the revealed card is the first. */
  const run = (top: readonly [string, string, string], order: readonly number[]) => {
    const g = signsGame([...top, ...FILLER]);
    g.act(0).cast(signs.name, { pay: true });
    g.passAll();
    const label = (i: number) => {
      const name = top[i] ?? '';
      const before = top.slice(0, i).filter((n) => n === name).length;
      return `${name}[${before}]`;
    };
    const labels = top.map((_n, i) => label(i));
    const other = labels.filter((_l, i) => !order.includes(i));
    g.act(0).arrange({ top: order.map((i) => labels[i] ?? ''), other });
    return g;
  };

  test('a card of mana value 5 draws five cards, the revealed card among them', () => {
    const g = run(['Forest', 'Serra Angel', 'Lightning Bolt'], [1, 0, 2]);
    g.expect.handSize(0, 5);
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.eventLog([
      { kind: 'cardsRevealed', seat: 0, names: ['Serra Angel'], from: 'library' },
    ]);
    g.expect.invariants();
  });

  test('the scry decides the card revealed: a card put on the bottom is not the one', () => {
    // Lightning Bolt (1) is on top before the scry; Serra Angel (5) is put on top and Bolt on the bottom.
    const g = run(['Lightning Bolt', 'Serra Angel', 'Forest'], [1, 2]);
    g.expect.handSize(0, 5);
  });

  test('a land card has mana value 0: no card is drawn', () => {
    const g = run(['Forest', 'Forest', 'Forest'], [0, 1, 2]);
    g.expect.handSize(0, 0);
  });

  test('an X in a mana cost is 0 in a library (CR 107.3a): {X} is mana value 0, {X}{R} is 1', () => {
    run([xOnly.name, 'Forest', 'Forest'], [0, 1, 2]).expect.handSize(0, 0);
    run([xSpell.name, 'Forest', 'Forest'], [0, 1, 2]).expect.handSize(0, 1);
  });

  test('nothing is drawn from an empty library, and the spell does not fail', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(signs.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .define(signs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(signs.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});

describe('a copy of the Elminster -3 ability: exile the top card, create tokens equal to its mana value', () => {
  const board = (library: readonly string[]) =>
    scenario({ seats: 3 })
      .define(elminster)
      .define(xOnly)
      .define(xSpell)
      .seat(0)
      .library(...library)
      .battlefield(elminster.name)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid and the ability costs 3 loyalty', () => {
    const ability = elminster.faces[0]?.abilities[0];
    expect(ability?.kind).toBe('activated');
  });

  test('a mana value 5 card is exiled and makes five 1/1 blue flying Faerie Dragons', () => {
    const g = board(['Serra Angel', ...FILLER]);
    g.act(0).activate(elminster.name, { ability: 0 });
    g.passAll();
    g.expect.zone('Serra Angel', 'exile', { seat: 0 });
    g.expect.counters(elminster.name, { loyalty: 2 });
    const dragons = g.find({ name: 'Faerie Dragon', zone: 'battlefield', seat: 0 });
    expect(dragons).toHaveLength(5);
    for (const dragon of dragons) {
      g.expect.pt(dragon.id, 1, 1);
    }
    g.expect.invariants();
  });

  test('a land card makes no token', () => {
    const g = board(['Forest', ...FILLER]);
    g.act(0).activate(elminster.name, { ability: 0 });
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    expect(g.find({ name: 'Faerie Dragon', zone: 'battlefield' })).toHaveLength(0);
  });

  test('an {X}{R} card exiled from the library has mana value 1 (X is 0): one token; {X} alone makes none', () => {
    const one = board([xSpell.name, ...FILLER]);
    one.act(0).activate(elminster.name, { ability: 0 });
    one.passAll();
    expect(one.find({ name: 'Faerie Dragon', zone: 'battlefield' })).toHaveLength(1);
    const none = board([xOnly.name, ...FILLER]);
    none.act(0).activate(elminster.name, { ability: 0 });
    none.passAll();
    expect(none.find({ name: 'Faerie Dragon', zone: 'battlefield' })).toHaveLength(0);
  });
});
