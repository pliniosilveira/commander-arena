import { describe, expect, test } from 'vitest';
import { FIXTURE_CARDS, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const CARD = "Sauron's Ransom";
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Sol Ring'] as const;

function castRansom(top: readonly string[] = TOP) {
  let b = scenario().seat(0).hand(CARD).pool('C').pool('U').pool('B');
  top.forEach((name, i) => {
    b.library(name, { label: `c${i}` });
  });
  b = b.seat(1).library('Island').at('precombatMain', { active: 0 });
  const g = b.build();
  g.act(0).cast(CARD, { pay: true });
  g.passAll();
  return g;
}

describe("Sauron's Ransom", () => {
  test('the issue card fixture validates', () => {
    const fixture = FIXTURE_CARDS[CARD];
    if (fixture === undefined) throw new Error("Sauron's Ransom fixture missing");
    expect(validateCard(fixture)).toEqual([]);
  });

  test('the separator privately sees the cards while the chooser sees only the face-up pile', () => {
    const g = castRansom();
    const d = chooseCardsDecision(g);
    expect(d.seat).toBe(1);
    expect(d.legal).toEqual(TOP.map((_, i) => g.id(`c${i}`)));
    expect(g.eventsSince(0).some((e) => e.kind === 'cardsRevealed')).toBe(false);
    expect(g.eventsSince(0)).toContainEqual({ kind: 'topCardsLooked', seat: 1, count: 4 });
    expect(g.view(1).pendingCards?.map((card) => card.name)).toEqual(TOP);
    expect(g.view(0).pendingCards).toBeUndefined();

    g.act(1).chooseCards('c0', 'c1');
    const view = g.view(0);
    expect(view.pending?.kind).toBe('chooseOption');
    if (view.pending?.kind !== 'chooseOption') throw new Error('pile choice missing');
    expect(view.pending.piles).toMatchObject({
      first: [],
      second: [g.id('c2'), g.id('c3')],
      faceDownCount: 2,
    });
    expect(view.pendingCards?.map((card) => card.name)).toEqual(['Serra Angel', 'Sol Ring']);
    expect(g.eventsSince(0)).toContainEqual({
      kind: 'faceDownPileSeparated',
      seat: 1,
      faceUp: ['Serra Angel', 'Sol Ring'],
      faceDownCount: 2,
    });
  });

  test('choosing the face-down pile moves its cards privately to hand, then tempts its controller', () => {
    const g = castRansom();
    g.act(1).chooseCards('c0', 'c1');
    g.act(0).chooseOption('pile1');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    expect(g.view(0).seats[0]?.ringTempted).toBe(1);
    expect(g.view(1).seats[0]?.hand).toBeNull();
    const chosen = g.eventsSince(0).find((event) => event.kind === 'pileChosen');
    expect(chosen).toMatchObject({ kind: 'pileChosen', pile: 1, names: [], faceDown: true });
    const serializedEvents = JSON.stringify(g.eventsSince(0));
    expect(serializedEvents).not.toContain('Grizzly Bears');
    expect(serializedEvents).not.toContain('Giant Spider');
  });

  test('one card can be put in either pile, including an empty face-down pile', () => {
    const g = castRansom(['Grizzly Bears']);
    expect(chooseCardsDecision(g).max).toBe(1);
    g.act(1).chooseCards();
    const choice = g.view(0).pending;
    expect(choice?.kind === 'chooseOption' ? choice.piles?.faceDownCount : null).toBe(0);
    g.act(0).chooseOption('pile2');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    expect(g.view(0).seats[0]?.ringTempted).toBe(1);
  });

  test('an empty library still lets the Ring tempt the controller', () => {
    const g = castRansom([]);
    g.expect.pending('priority', 0);
    expect(g.view(0).seats[0]?.ringTempted).toBe(1);
  });
});
