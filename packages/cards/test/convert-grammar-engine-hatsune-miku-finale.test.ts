// Finale of Devastation (issue 145): the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override and is played through
// applyAction. Pins: CR 701.23a, 701.23b (search a zone, find or not; the graveyard and the library are searched together), 107.3a and 202.3 (a mana value of X or less reads the X announced
// for the spell), 202.3e (an {X} in the cost of a card in a library or a graveyard counts as 0), 608.2c ("If X is 10 or more" is read as the spell resolves), 701.24a (shuffle).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const FINALE = 'Finale of Devastation';
const BEARS = 'Grizzly Bears'; // mana value 2
const SPIDER = 'Giant Spider'; // mana value 4
const ANGEL = 'Serra Angel'; // mana value 5
const finale = real(FINALE);

const forests = (n: number) => Array.from({ length: n }, () => 'Forest');

describe('Finale of Devastation: search the library and/or graveyard for a creature card with mana value X or less', () => {
  test('the card is valid', () => {
    expect(validateCard(finale)).toEqual([]);
  });

  /** Seat 0 holds the spell, `lands` Forests and a Grizzly Bears on the battlefield; the creature cards named are in the library and the graveyard. */
  const start = (lands: number, inLibrary: string[], inGraveyard: string[] = []) =>
    scenario()
      .define(finale)
      .seat(0)
      .life(20)
      .battlefield(...forests(lands), BEARS)
      .hand(FINALE)
      .library('Forest', 'Forest', ...inLibrary)
      .graveyard(...inGraveyard)
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('only creature cards with mana value X or less are offered, from the library and the graveyard together', () => {
    const g = start(6, [SPIDER, ANGEL, 'Forest'], [BEARS]);
    g.act(0).cast(FINALE, { x: 4, pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    // Giant Spider (4) from the library and the Grizzly Bears (2) of the graveyard, not the Serra Angel (5), not the Forest.
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards') throw new Error('expected a card choice');
    expect([...decision.legal].sort()).toEqual(
      [g.id({ name: SPIDER, zone: 'library' }), g.id({ name: BEARS, zone: 'graveyard' })].sort(),
    );
  });

  test('a card of the library is put onto the battlefield and the library is shuffled', () => {
    const g = start(6, [SPIDER], []);
    g.act(0).cast(FINALE, { x: 4, pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id({ name: SPIDER, zone: 'library' }));
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    // X is 4: no pump.
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('a card of the graveyard is put onto the battlefield and the library is not searched, so not shuffled', () => {
    const g = start(4, [], [BEARS]);
    g.act(0).cast(FINALE, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id({ name: BEARS, zone: 'graveyard' }));
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    g.expect.invariants();
  });

  test('the player may find nothing (CR 701.23b), and the library is shuffled', () => {
    const g = start(4, [BEARS], []);
    g.act(0).cast(FINALE, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
  });

  test('a creature card with a higher mana value than X is not offered: with none to find, the library is still shuffled (CR 701.23c)', () => {
    const g = start(3, [ANGEL], []);
    g.act(0).cast(FINALE, { x: 1, pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.invariants();
  });

  test('with X of 10 or more the creatures you control get +X/+X and haste until end of turn, the creature found too', () => {
    const g = start(12, [ANGEL], []);
    g.act(0).cast(FINALE, { x: 10, pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id({ name: ANGEL, zone: 'library' }));
    g.expect.pt(BEARS, 12, 12);
    g.expect.pt(ANGEL, 14, 14);
    g.expect.derived(BEARS, { keywords: ['haste'] });
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance', 'haste'] });
    g.passAll();
    g.expect.invariants();
  });

  test('with X of 9 nothing is pumped', () => {
    const g = start(11, [ANGEL], []);
    g.act(0).cast(FINALE, { x: 9, pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id({ name: ANGEL, zone: 'library' }));
    g.expect.pt(BEARS, 2, 2);
    g.expect.derived(BEARS, { keywords: [] });
  });
});

describe('Chord of Calling: the same search of the library alone, with the shuffle in the same sentence', () => {
  const chord = real('Chord of Calling');

  test('the creature card of mana value X or less goes onto the battlefield', () => {
    const g = scenario()
      .define(chord)
      .seat(0)
      .battlefield(...forests(7))
      .hand('Chord of Calling')
      .library('Forest', SPIDER, ANGEL)
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('Chord of Calling', { x: 4, pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseCards') throw new Error('expected a card choice');
    expect(decision.legal).toEqual([g.id({ name: SPIDER, zone: 'library' })]);
    g.act(0).chooseCards(g.id({ name: SPIDER, zone: 'library' }));
    g.expect.zone(SPIDER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('a search for a card with mana value X or less is read only where the spell has an X', () => {
  test('near misses stay unsupported (SYNTHETIC wordings)', () => {
    for (const text of [
      // The card is Finale itself: these only change the wording of the search.
      'Search your library and/or graveyard for a creature card with mana value 3 or less and put it onto the battlefield. If you search your library this way, shuffle.',
      'Search your library and/or graveyard for a creature card with mana value X and put it onto the battlefield. If you search your library this way, shuffle.',
      'Search your library and/or graveyard for creature cards with mana value X or less and put them onto the battlefield. If you search your library this way, shuffle.',
      'Search your library and/or graveyard for a creature card with mana value X or less, then reveal it and put it onto the battlefield.',
      'Search your library and/or graveyard and/or hand for a creature card with mana value X or less and put it onto the battlefield.',
    ]) {
      expect(withText(FINALE, text).support.status, text).toBe('unsupported');
    }
  });
});
