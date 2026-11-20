// The Quick Draw deck (issue 121): the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar as a card with no override, reads as supported, and is played
// through the engine: what the text says is what happens. One section for each group of the deck.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const load = (name: string) => {
  const found = cards.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  return imported.definition;
};
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

// ---- Plot and Jump-start

test('Radical Idea: jump-start casts it from the graveyard by discarding a card, and it is exiled', () => {
  const idea = load('Radical Idea');
  const g = scenario()
    .define(idea)
    .seat(0)
    .library(...FILLER)
    .graveyard(idea.name)
    .hand('Plains')
    .pool('UU')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(idea.name, { alternative: 'jumpStart', pay: true });
  g.passAll();
  g.expect.zone('Plains', 'graveyard', { seat: 0 });
  g.expect.zone(idea.name, 'exile');
  // The Plains it discarded is gone and one card was drawn.
  expect(g.state.seats[0]?.hand).toHaveLength(1);
  g.expect.invariants();
});

test('Lock and Load: plot it, then cast it free in a later turn, drawing for the other instants and sorceries cast that turn', () => {
  const lock = load('Lock and Load');
  const idea = load('Radical Idea');
  const g = scenario()
    .define(lock)
    .define(idea)
    .seat(0)
    .library(...FILLER)
    .hand(lock.name, idea.name)
    .battlefield('Island', { count: 6 })
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).plot(lock.name, { pay: true });
  g.expect.zone(lock.name, 'exile');
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('precombatMain', { turn: 'next' });
  g.expect.pending('priority', 0);
  // An instant first (Radical Idea draws one), then Lock and Load for free: one card, plus one for the instant.
  g.act(0).cast(idea.name, { pay: true });
  g.passAll();
  const before = g.state.seats[0]?.hand.length ?? 0;
  g.act(0).cast(lock.name, { alternative: 'free' });
  g.passAll();
  expect((g.state.seats[0]?.hand.length ?? 0) - before).toBe(2);
  g.expect.invariants();
});

test('Pyretic Charge: discard the hand, draw four, and creatures you control get +1/+0 for each card discarded', () => {
  const charge = load('Pyretic Charge');
  const g = scenario()
    .define(charge)
    .seat(0)
    .library(...FILLER)
    .hand(charge.name, 'Plains', 'Plains', 'Plains')
    .battlefield('Grizzly Bears')
    .battlefield('Mountain', { count: 5 })
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(charge.name, { pay: true });
  g.passAll();
  // Three Plains were in the hand when the spell resolved; four cards were drawn.
  expect(g.state.seats[0]?.hand).toHaveLength(4);
  g.expect.pt('Grizzly Bears', 5, 2);
  g.expect.invariants();
});
