// Connive of several permanents (CR 701.50, D-209, D-223).
// Pins: CR 701.50a (the controller draws a card, then discards a card; a nonland card puts a +1/+1 counter on the conniving permanent), CR 701.50b (a permanent
// that is no longer on the battlefield as the effect instructs it to connive: its last-known information says who controlled it; it still connives and no counter
// can be put on it), CR 701.50c (several permanents at once: the first player in APNAP order who controls one or more of them chooses one and it connives, then
// the process repeats for each remaining instruction), CR 101.4 (APNAP order).
// The card is SYNTHETIC and built here: no real card connives a whole group.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { chooseCardsDecision, choosePermanentDecision } from './pending-helpers';

const MASS = 'SYNTHETIC Mass Connive';
const massConnive = singleFaceCard({
  name: MASS,
  manaCost: ['1', 'U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Each creature connives.',
  spell: {
    effect: { kind: 'connive', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const counters = (g: ReturnType<typeof setup>, name: string, seat: 0 | 1) =>
  getView(g.state, 0).battlefield.find((o) => o.name === name && o.controller === seat)?.counters;

function setup() {
  return scenario()
    .define(massConnive)
    .seat(0)
    .hand(MASS, BEARS, BEARS)
    .battlefield('Island', 'Island', BEARS, SPIDER)
    .library(...LIBRARY)
    .seat(1)
    .hand(BEARS)
    .battlefield(SPIDER)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('several permanents connive at once (CR 701.50c)', () => {
  test('the active player, who controls two of them, chooses which connives first; the opponent comes after', () => {
    const g = setup();
    g.act(0).cast(MASS, { pay: true });
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ purpose: 'conniveOrder', seat: 0, min: 1, max: 1 });
    expect(d.legal).toHaveLength(2);
    // Seat 0 chooses the Spider: it draws, then discards (a nonland card, so the Spider gets the counter).
    g.act(0).choosePermanents({ name: SPIDER, seat: 0 });
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(counters(g, SPIDER, 0)).toEqual({ '+1/+1': 1 });
    expect(counters(g, BEARS, 0)).toEqual({});
    // The Bears of seat 0 is the only one left of theirs: no question. It draws and discards a land: no counter.
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: 'Plains', zone: 'hand', nth: 0 });
    expect(counters(g, BEARS, 0)).toEqual({});
    // Then the opponent's creature: it connives for its controller.
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 1 });
    g.act(1).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(counters(g, SPIDER, 1)).toEqual({ '+1/+1': 1 });
    g.expect.invariants();
  });

  test("the other order is the player's to choose: the Bears first leaves the Spider for last", () => {
    const g = setup();
    g.act(0).cast(MASS, { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: BEARS, seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(counters(g, BEARS, 0)).toEqual({ '+1/+1': 1 });
    g.act(0).chooseCards({ name: 'Plains', zone: 'hand', nth: 0 });
    expect(counters(g, SPIDER, 0)).toEqual({});
  });

  test('the player is not asked when each player controls just one: the active player first', () => {
    const g = scenario()
      .define(massConnive)
      .seat(0)
      .hand(MASS, BEARS)
      .battlefield('Island', 'Island', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(BEARS)
      .battlefield(SPIDER)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MASS, { pay: true });
    g.passAll();
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 1 });
  });

  test("on the opponent's turn the opponent is the active player and chooses first", () => {
    const g = scenario()
      .define(massConnive)
      .seat(0)
      .battlefield(BEARS)
      .hand(BEARS)
      .library(...LIBRARY)
      .seat(1)
      .hand(MASS, BEARS)
      .battlefield('Island', 'Island', BEARS, SPIDER)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(MASS, { pay: true });
    g.passAll();
    expect(choosePermanentDecision(g)).toMatchObject({ purpose: 'conniveOrder', seat: 1 });
  });
});

describe('a permanent that left the battlefield still connives (CR 701.50b)', () => {
  const ENDING = 'SYNTHETIC Last Connive';
  const lastConnive = singleFaceCard({
    name: ENDING,
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Sacrifice target creature you control. It connives.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'sacrifice', objects: { kind: 'target', id: 't1' } },
          { kind: 'connive', objects: { kind: 'target', id: 't1' } },
        ],
      },
    },
  });

  test('its last controller draws and discards, and no counter can be put on it', () => {
    const g = scenario()
      .define(lastConnive)
      .seat(0)
      .hand(ENDING, BEARS)
      .battlefield('Island', 'Island', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const before = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(ENDING, { targets: [{ name: BEARS, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // It connives: its last controller draws a card, then discards one (the hand: the Bears left after the spell).
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(before - 1);
    g.expect.invariants();
  });
});
