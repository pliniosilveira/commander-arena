// The Quick Draw deck (issue 121): the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar as a card with no override, reads as supported, and is played
// through the engine: what the text says is what happens. One section for each group of the deck.
import { readFileSync } from 'node:fs';
import { getLegalActions } from '@commander-arena/engine';
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

// ---- Costs less

const castableFromHand = (
  g: ReturnType<ReturnType<typeof scenario>['build']>,
  name: string,
): boolean => {
  const card = g.find({ name, zone: 'hand', seat: 0 })[0];
  return getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
  );
};

test('Octavia, Living Thesis costs {8} less with eight or more instant and sorcery cards in the graveyard', () => {
  const octavia = load('Octavia, Living Thesis');
  const build = (spells: number, pool: string) => {
    const b = scenario()
      .define(octavia)
      .seat(0)
      .library(...FILLER)
      .hand(octavia.name)
      .pool(pool);
    for (let i = 0; i < spells; i += 1) b.graveyard(i % 2 === 0 ? 'Lightning Bolt' : 'Divination');
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };
  // {8}{U}{U} less {8}: {U}{U}.
  expect(castableFromHand(build(8, 'UU'), octavia.name)).toBe(true);
  expect(castableFromHand(build(7, 'UU'), octavia.name)).toBe(false);
  expect(castableFromHand(build(7, 'UUUUUUUUUU'), octavia.name)).toBe(true);
});

test('Eris, Roar of the Storm costs {2} less for each different mana value among the instants and sorceries in the graveyard', () => {
  const eris = load('Eris, Roar of the Storm');
  const build = (graveyard: readonly string[], pool: string) => {
    const b = scenario()
      .define(eris)
      .seat(0)
      .library(...FILLER)
      .hand(eris.name)
      .pool(pool);
    for (const card of graveyard) b.graveyard(card);
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };
  // Lightning Bolt has mana value 1 and Divination 3: two values, {4}{U}{R} of {8}{U}{R}.
  expect(castableFromHand(build(['Lightning Bolt', 'Divination'], 'UUUURR'), eris.name)).toBe(true);
  expect(castableFromHand(build(['Lightning Bolt', 'Divination'], 'UUURR'), eris.name)).toBe(false);
  // Two cards of one value are one value.
  expect(castableFromHand(build(['Lightning Bolt', 'Lightning Bolt'], 'UUUURR'), eris.name)).toBe(
    false,
  );
  expect(castableFromHand(build(['Lightning Bolt', 'Lightning Bolt'], 'UUUUUURR'), eris.name)).toBe(
    true,
  );
});

test('Pteramander: Adapt 4 puts four counters on it only once, and the ability costs {1} less for each instant and sorcery in the graveyard', () => {
  const pteramander = load('Pteramander');
  const build = (spells: number, pool: string) => {
    const b = scenario()
      .define(pteramander)
      .seat(0)
      .library(...FILLER)
      .battlefield(pteramander.name)
      .pool(pool);
    for (let i = 0; i < spells; i += 1) b.graveyard(i % 2 === 0 ? 'Lightning Bolt' : 'Divination');
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };
  const g = build(7, 'UU');
  g.act(0).activate(pteramander.name, { pay: true });
  g.passAll();
  // 1/1 with four +1/+1 counters.
  g.expect.pt(pteramander.name, 5, 5);
  // A second activation does nothing: it has counters now.
  g.act(0).activate(pteramander.name, { pay: true });
  g.passAll();
  g.expect.pt(pteramander.name, 5, 5);
  g.expect.invariants();
  // With six cards the ability needs {1}{U}.
  const poor = build(6, 'U');
  poor.expect.illegal(0, { activate: pteramander.name });
});
