// The Prismari deck (issue 87), group 3: casting several spells from among cards an effect exiled, without paying their mana costs. Plargg and Nassari: "At the beginning of your upkeep,
// each player exiles cards from the top of their library until they exile a nonland card. An opponent chooses a nonland card exiled this way. You may cast up to two spells from among the
// other cards exiled this way without paying their mana costs." (SYNTHETIC Chaos Orc), and "up to two spells from among them" (SYNTHETIC Twin Cast), both in
// src/cards/fixtures/synthetic-prismari-g3.ts. Pins: CR 608.2g (the spells are cast while the effect resolves: CR 601.2a-i, no priority afterwards, they stay on the stack and the effect goes
// on, "which may include casting other spells this way"), CR 118.9 and 107.3b (without paying the mana cost, X is 0), CR 701.13 (exile), CR 101.4 (the active player exiles first),
// CR 608.2d (an opponent chooses), CR 400.7 (a card that was cast is a new object, never offered again), CR 733 (a cast can be taken back).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const ORC = 'SYNTHETIC Chaos Orc';
const TWIN = 'SYNTHETIC Twin Cast';
const GAIN2 = 'SYNTHETIC Calamity Gain Two'; // {1}{R} sorcery, gain 2 life
const GAIN7 = 'SYNTHETIC Calamity Gain Seven'; // {6}{R} sorcery, gain 7 life
const DISCARD_DRAW = 'SYNTHETIC Calamity Discard Draw'; // {R} sorcery, additional cost: discard a card; draw two
const XSPELL = 'SYNTHETIC Prismari X Spell'; // {X}{R} instant, gain X life
const TRINKET = 'SYNTHETIC Prismari Trinket'; // {2} artifact
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's upkeep of turn 3 with the Orc's trigger on the stack: seat 0's library and seat 1's, top first. */
function upkeep(
  mine: readonly string[],
  theirs: readonly string[],
  extra: (b: Builder) => void = () => {},
) {
  const b = scenario()
    .seat(0)
    .battlefield(ORC)
    .library(...mine, ...FILLER);
  extra(b);
  const g = b
    .seat(1)
    .library(...theirs, ...FILLER)
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

const exiled = (g: ScenarioGame, name: string, seat: 0 | 1) =>
  g.find({ name, zone: 'exile', seat }).filter((o) => o.card !== null);
const inExile = (g: ScenarioGame) => g.state.exile.map((id) => g.state.objects[id]);

describe('the cards are valid', () => {
  test(ORC, () => expect(validateCard(syntheticCard(ORC))).toEqual([]));
  test(TWIN, () => expect(validateCard(syntheticCard(TWIN))).toEqual([]));
});

describe('each player exiles from the top of their library until a nonland card (CR 701.13, 101.4)', () => {
  test('both players exile their lands and their first nonland card; the cards below stay', () => {
    const g = upkeep(['Island', GAIN2], ['Island', 'Island', GAIN7]);
    g.passAll();
    // Seat 0's library: Island, Gain Two exiled, the rest stays; seat 1's: Island, Island, Gain Seven.
    expect(exiled(g, 'Island', 0)).toHaveLength(1);
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    expect(exiled(g, 'Island', 1)).toHaveLength(2);
    expect(exiled(g, GAIN7, 1)).toHaveLength(1);
    expect(g.state.seats[0]?.library).toHaveLength(FILLER.length);
    expect(g.state.seats[1]?.library).toHaveLength(FILLER.length);
    g.expect.invariants();
  });

  test('the active player exiles first: its cards were exiled before the opponent’s (CR 101.4)', () => {
    const g = upkeep([GAIN2], [GAIN7]);
    g.passAll();
    const order = g.state.exile.map((id) => g.state.objects[id]?.owner);
    expect(order).toEqual([0, 1]);
  });

  test('a library with no nonland card is exiled to its end, and the player does not lose for it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORC)
      .library(GAIN2, ...FILLER)
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(exiled(g, 'Island', 1)).toHaveLength(3);
    expect(g.state.seats[1]?.library).toHaveLength(0);
    expect(g.state.seats[1]?.hasLost).toBe(false);
    // The opponent's only nonland card to choose is mine: nothing to ask, and it is set aside, so nothing is left to cast.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('a player with an empty library exiles nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORC)
      .library(GAIN2, ...FILLER)
      .seat(1)
      .battlefield('Island')
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    expect(inExile(g)).toHaveLength(1);
  });
});

describe('an opponent chooses a nonland card exiled this way (CR 608.2d)', () => {
  test('the question is asked of the opponent, with the nonland cards only, face up', () => {
    const g = upkeep(['Island', GAIN2], ['Island', GAIN7]);
    g.passAll();
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ seat: 1, purpose: 'opponentChoice', zone: 'exile', min: 1, max: 1 });
    expect(d.legal.map((id) => g.state.objects[id]?.card)).toHaveLength(2);
    const names = d.legal.map(
      (id) =>
        g
          .find({ name: GAIN2, zone: 'exile' })
          .concat(g.find({ name: GAIN7, zone: 'exile' }))
          .find((o) => o.id === id)?.id,
    );
    expect(names).toHaveLength(2);
    // No land is among them.
    expect(d.legal.every((id) => g.state.objects[id]?.zone === 'exile')).toBe(true);
    expect(d.legal).not.toContain(g.find({ name: 'Island', zone: 'exile', seat: 0 })[0]?.id);
  });

  test('the card the opponent chooses is set aside: the other nonland card is offered, free', () => {
    const g = upkeep([GAIN2], [GAIN7]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    // I may cast the other one: the opponent's card, owned by the opponent, cast by me.
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ seat: 0, purpose: 'cast', zone: 'exile' });
    expect(d.legal).toEqual([g.find({ name: GAIN7, zone: 'exile', seat: 1 })[0]?.id]);
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 1 });
    g.passAll();
    g.expect.life(0, 47);
    // The card the opponent chose never moved.
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('the cards not cast stay exiled; declining casts nothing', () => {
    const g = upkeep([GAIN2], [GAIN7]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN7, zone: 'exile', seat: 1 });
    g.act(0).chooseCards();
    g.expect.life(0, 40);
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    expect(exiled(g, GAIN7, 1)).toHaveLength(1);
    g.expect.pending('priority', 0);
  });

  test('with one nonland card there is nothing to choose: it is set aside and nothing is cast', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ORC)
      .library('Island', GAIN2, ...FILLER)
      .seat(1)
      .library('Island', 'Island')
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.life(0, 40);
    expect(g.state.stack).toHaveLength(0);
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    g.expect.eventLog([{ kind: 'cardsChosen', seat: 1, automatic: true }]);
  });

  test('lands are among "the other cards" but cannot be cast: they are not offered', () => {
    const g = upkeep(['Island', 'Island', GAIN2], ['Island', GAIN7]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards();
    expect(exiled(g, 'Island', 0)).toHaveLength(2);
  });

  test('a spell with an additional cost: the cost is paid (CR 601.2b), the mana cost is not', () => {
    const g = upkeep([GAIN2], [DISCARD_DRAW], (b) => b.hand('Plains'));
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: DISCARD_DRAW, zone: 'exile', seat: 1 });
    // The additional cost is asked as the spell is cast: discard the one card in hand (nothing to choose).
    g.passAll();
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.invariants();
  });

  test('a spell whose additional cost cannot be paid is not offered', () => {
    const g = upkeep([GAIN2], [DISCARD_DRAW]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    // No card in hand to discard: nothing can be cast, so nothing is asked.
    g.expect.pending('priority', 0);
    expect(exiled(g, DISCARD_DRAW, 1)).toHaveLength(1);
  });

  test('X is 0 for a spell cast without paying its mana cost (CR 107.3b)', () => {
    const g = upkeep([GAIN2], [XSPELL]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: XSPELL, zone: 'exile', seat: 1 });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('a card that is not a spell (an artifact) is a nonland card the opponent may choose, and it can be cast', () => {
    const g = upkeep([TRINKET], [GAIN7]);
    g.passAll();
    g.act(1).chooseCards({ name: GAIN7, zone: 'exile', seat: 1 });
    g.act(0).chooseCards({ name: TRINKET, zone: 'exile', seat: 0 });
    g.passAll();
    g.expect.zone(TRINKET, 'battlefield', { seat: 0 });
  });

  test('the cast can be taken back: the question is asked again (CR 733)', () => {
    const g = upkeep([GAIN2], [DISCARD_DRAW], (b) => b.hand('Plains', 'Mountain'));
    g.passAll();
    g.act(1).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: DISCARD_DRAW, zone: 'exile', seat: 1 });
    // Two cards in hand: which to discard is asked, and the cast is taken back there.
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).cancel();
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'cast', seat: 0 });
    g.act(0).chooseCards();
    expect(exiled(g, DISCARD_DRAW, 1)).toHaveLength(1);
  });
});

/** Seat 0 casts Twin Cast with three known cards on top of the library. */
function twin(top: readonly string[], extra: (b: Builder) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .hand(TWIN)
    .library(...top, ...FILLER)
    .pool('RRRRR');
  extra(b);
  const g = b
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(TWIN, { pay: true });
  g.passAll();
  return g;
}

describe('"up to two spells from among them" (CR 608.2g)', () => {
  test('zero, one or two: each is a question, and the player may stop at any of them', () => {
    const g = twin([GAIN2, GAIN7, DISCARD_DRAW]);
    // First question: three cards can be cast.
    const first = chooseCardsDecision(g);
    expect(first).toMatchObject({ purpose: 'cast', zone: 'exile', min: 0, max: 1 });
    expect(first.legal).toHaveLength(2); // the discard spell needs a card in hand
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    // The first spell is on the stack; the second question comes: the card cast is not offered again.
    const second = chooseCardsDecision(g);
    expect(second.legal).toEqual([g.find({ name: GAIN7, zone: 'exile', seat: 0 })[0]?.id]);
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    // Two spells cast: no third question; both are on the stack above Twin Cast's own resolution.
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(g.state.stack.map((id) => g.state.objects[id]?.stack?.kind)).toEqual(['spell', 'spell']);
    g.passAll();
    g.expect.life(0, 49);
    g.expect.invariants();
  });

  test('stopping after the first: the second question is answered with no card', () => {
    const g = twin([GAIN2, GAIN7, 'Island']);
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards();
    g.passAll();
    g.expect.life(0, 42);
    expect(exiled(g, GAIN7, 0)).toHaveLength(1);
  });

  test('none cast: everything stays exiled', () => {
    const g = twin([GAIN2, GAIN7, 'Island']);
    g.act(0).chooseCards();
    g.expect.pending('priority', 0);
    expect(exiled(g, GAIN2, 0)).toHaveLength(1);
    expect(exiled(g, GAIN7, 0)).toHaveLength(1);
    expect(exiled(g, 'Island', 0)).toHaveLength(1);
  });

  test('with only one spell among the cards, the question is not asked a second time', () => {
    const g = twin([GAIN2, 'Island', 'Island']);
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });

  test('no spell among the cards: nothing is asked', () => {
    const g = twin(['Island', 'Island', 'Island']);
    g.expect.pending('priority', 0);
    expect(inExile(g)).toHaveLength(3);
  });

  test('the spells are on the stack together, the last one cast resolves first (CR 608.2g)', () => {
    const g = twin([GAIN2, GAIN7, 'Island']);
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: GAIN7, zone: 'exile', seat: 0 });
    // Top first: Gain Seven was cast last, so it resolves first.
    g.expect.stack([GAIN7, GAIN2]);
    g.pass();
    g.pass();
    g.expect.life(0, 47);
    g.expect.stack([GAIN2]);
  });

  test('cancelling the second cast rewinds to its question, with the first spell still on the stack', () => {
    const g = twin([GAIN2, DISCARD_DRAW, 'Island'], (b) => b.hand('Plains', 'Mountain'));
    g.act(0).chooseCards({ name: GAIN2, zone: 'exile', seat: 0 });
    g.act(0).chooseCards({ name: DISCARD_DRAW, zone: 'exile', seat: 0 });
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).cancel();
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'cast' });
    g.expect.stack([GAIN2, TWIN]);
  });
});
