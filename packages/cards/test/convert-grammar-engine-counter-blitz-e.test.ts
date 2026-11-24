// The Counter Blitz deck (Final Fantasy Commander), group E: Scholar of New Horizons. The REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override,
// is defined in an engine scenario with three seats and is played through applyAction. Pins: CR 701.23a and 701.23b (the search, a card with a stated quality may be found or not), CR 701.20
// (the card is revealed), CR 608.2c and 608.2d ("if an opponent controls more lands than you" is read as the instruction comes up, "you may put" is the player's choice, and the card not put
// onto the battlefield goes to the hand), CR 701.24 (the shuffle comes last, after the card has moved), CR 118.3 and 122.1 (a counter removed for the cost), CR 102.2 (an opponent is any
// of the other players).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const scholar = real('Scholar of New Horizons');
const NAME = scholar.name;
const LIBRARY = ['Plains', 'Plains', 'Island', 'Forest', 'Swamp', 'Mountain'];

describe('Scholar of New Horizons is valid and supported', () => {
  test('valid', () => {
    expect(validateCard(scholar)).toEqual([]);
  });

  test('the real text reads as a search that may put the card onto the battlefield, else into the hand', () => {
    const json = JSON.stringify(scholar.faces);
    expect(json).toContain('"kind":"search"');
    expect(json).toContain('"mayPut"');
    expect(json).toContain('"opponentsWithMore"');
    expect(json).toContain('"reveal":true');
    expect(json).toContain('"shuffle":true');
  });
});

/**
 * Three seats. Seat 0 has the Scholar (with its +1/+1 counter) and `mine` Swamps; seat 1 has `second` Forests and seat 2 has `third` Forests. The library of seat 0 holds two Plains.
 */
const board = (mine: number, second: number, third: number) =>
  scenario({ seats: 3 })
    .define(scholar)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(NAME, { counters: { '+1/+1': 1 } })
    .battlefield(...Array.from({ length: mine }, () => 'Swamp'))
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...Array.from({ length: second }, () => 'Forest'))
    .seat(2)
    .library(...LIBRARY)
    .battlefield(...Array.from({ length: third }, () => 'Forest'))
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

type Game = ReturnType<typeof board>;

const plainsIn = (g: Game, zone: 'hand' | 'battlefield' | 'library') =>
  g.find({ name: 'Plains', zone, seat: 0 });

/** Activates the Scholar and resolves the ability up to the choice of the Plains. */
function searchStep(g: Game) {
  g.act(0).activate(NAME);
  g.expect.counters(NAME, {});
  g.passAll();
  g.expect.pending('chooseCards', 0);
}

describe('"If an opponent controls more lands than you": any one of the opponents (CR 102.2, 608.2c)', () => {
  test('the second opponent has more: the player is asked', () => {
    const g = board(3, 3, 4);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('confirmOptional', 0);
  });

  test('the first opponent has more: the player is asked', () => {
    const g = board(3, 5, 1);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('confirmOptional', 0);
  });

  test('nobody has more (one equal, one fewer): nothing is asked and the card goes to the hand', () => {
    const g = board(3, 3, 1);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('priority', 0);
    expect(plainsIn(g, 'hand')).toHaveLength(1);
    expect(plainsIn(g, 'battlefield')).toHaveLength(0);
  });

  test('the total of the opponents does not count, only one opponent with more lands', () => {
    const g = board(3, 2, 3);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('priority', 0);
    expect(plainsIn(g, 'hand')).toHaveLength(1);
  });
});

describe('the card found: onto the battlefield tapped, or into the hand (CR 608.2d, 614.1c)', () => {
  test('accepting puts the Plains onto the battlefield tapped; the library is shuffled once, after it moved', () => {
    const g = board(3, 3, 4);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.act(0).accept();
    const onBattlefield = plainsIn(g, 'battlefield');
    expect(onBattlefield).toHaveLength(1);
    expect(onBattlefield.every((p) => p.tapped)).toBe(true);
    expect(plainsIn(g, 'hand')).toHaveLength(0);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'cardsRevealed', seat: 0 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.librarySize(0, LIBRARY.length - 1);
    g.expect.invariants();
  });

  test('declining puts it into the hand, even though an opponent has more lands', () => {
    const g = board(3, 3, 4);
    searchStep(g);
    g.act(0).chooseCards('Plains[0]');
    g.act(0).decline();
    expect(plainsIn(g, 'hand')).toHaveLength(1);
    expect(plainsIn(g, 'battlefield')).toHaveLength(0);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.librarySize(0, LIBRARY.length - 1);
    g.expect.invariants();
  });

  test('only a Plains card can be found', () => {
    const g = board(3, 3, 4);
    searchStep(g);
    const choices = (g.view(0).pending as { legal?: readonly string[] } | null)?.legal ?? [];
    expect(choices).toHaveLength(2);
    const island = g.id({ name: 'Island', seat: 0, zone: 'library' });
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [island] }).ok).toBe(false);
  });

  test('finding no card (CR 701.23b) asks nothing, and the library is still shuffled', () => {
    const g = board(3, 3, 4);
    searchStep(g);
    g.act(0).chooseCards();
    g.expect.pending('priority', 0);
    expect(plainsIn(g, 'hand')).toHaveLength(0);
    expect(plainsIn(g, 'battlefield')).toHaveLength(0);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
  });

  test('a library with no Plains: nothing is found and nothing is asked', () => {
    const g = scenario({ seats: 3 })
      .define(scholar)
      .seat(0)
      .library('Island', 'Forest')
      .battlefield(NAME, { counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', 'Forest')
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(NAME);
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.librarySize(0, 2);
  });
});

describe('what the grammar refuses (a card is supported or not, never half run)', () => {
  const status = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Probe',
        typeLine: 'Creature — Human Scout',
        oracleText: text,
        power: '1',
        toughness: '1',
      }),
    ).support.status;
  const LEAD = '{T}: Search your library for a Plains card and reveal it.';
  const PUT =
    'If an opponent controls more lands than you, you may put that card onto the battlefield tapped.';
  const ELSE = "If you don't put the card onto the battlefield, put it into your hand.";

  test('the whole text is supported', () => {
    expect(status(`${LEAD} ${PUT} ${ELSE} Then shuffle.`)).toBe('supported');
  });

  test('the put onto the battlefield untapped is read as an untapped put (no `tapped`)', () => {
    const probe = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Probe',
        typeLine: 'Creature — Human Scout',
        oracleText: `${LEAD} ${PUT.replace(' tapped', '')} ${ELSE} Then shuffle.`,
        power: '1',
        toughness: '1',
      }),
    );
    expect(probe.support.status).toBe('supported');
    const json = JSON.stringify(probe.definition.faces);
    expect(json).toContain('"mayPut"');
    expect(json).not.toContain('"tapped":true');
  });

  test('without the sentence that says where the card goes if it is not put, the text is not read', () => {
    expect(status(`${LEAD} ${PUT} Then shuffle.`)).not.toBe('supported');
  });

  test('a condition that is not about the opponents is not read', () => {
    expect(
      status(
        `${LEAD} If you control a creature, you may put that card onto the battlefield tapped. ${ELSE} Then shuffle.`,
      ),
    ).not.toBe('supported');
  });

  test('another comparison with the opponents is read by the same words (life)', () => {
    expect(
      status(
        `${LEAD} If an opponent has more life than you, you may put that card onto the battlefield tapped. ${ELSE} Then shuffle.`,
      ),
    ).toBe('supported');
  });
});
