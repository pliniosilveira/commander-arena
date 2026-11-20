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

// ---- The next spell

test('Kaza, Roil Chaser: the next instant or sorcery costs {X} less, X the Wizards you control', () => {
  const kaza = load('Kaza, Roil Chaser');
  const g = scenario()
    .define(kaza)
    .seat(0)
    .library(...FILLER)
    .battlefield(kaza.name)
    .hand('Divination')
    .pool('UU')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  // Divination costs {2}{U}: with one Wizard it costs {1}{U}.
  expect(castableFromHand(g, 'Divination')).toBe(false);
  g.act(0).activate(kaza.name);
  g.passAll();
  expect(castableFromHand(g, 'Divination')).toBe(true);
  g.act(0).cast('Divination', { pay: true });
  g.passAll();
  expect(g.state.seats[0]?.hand).toHaveLength(2);
  g.expect.invariants();
});

test('Crackling Spellslinger: cast it, and the next instant or sorcery you cast this turn has storm', () => {
  const slinger = load('Crackling Spellslinger');
  const g = scenario()
    .define(slinger)
    .seat(0)
    .library(...FILLER)
    .hand(slinger.name, 'Lightning Bolt')
    .pool('RRRRRR')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(slinger.name, { pay: true });
  // The spell resolves and its enters trigger with it.
  g.passAll();
  g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
  // The Bolt, and its storm trigger above it: one spell was cast before it.
  expect(g.state.stack).toHaveLength(2);
  // The storm trigger resolves and asks about new targets for the copy: it keeps the opponent.
  g.passAll();
  g.act(0).chooseTargets({ player: 1 });
  g.passAll();
  g.expect.life(1, 40 - 6);
});

test('Smoldering Stagecoach: when it attacks, the next instant and the next sorcery cascade', () => {
  const coach = load('Smoldering Stagecoach');
  const g = scenario()
    .define(coach)
    .seat(0)
    .library(...FILLER)
    .battlefield(coach.name)
    .battlefield('Grizzly Bears', { count: 2 })
    .hand('Lightning Bolt')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  // Crew 2: the Bears tap, the Vehicle becomes a creature and attacks.
  g.act(0).activate(coach.name);
  g.act(0).choosePermanents('Grizzly Bears[0]', 'Grizzly Bears[1]');
  g.passAll();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker: coach.name, target: { player: 1 } }]);
  g.passAll();
  expect(g.state.continuousEffects.filter((e) => e.change.kind === 'nextSpell')).toHaveLength(2);
});

// ---- Singles

test('Leyline Dowser: mill a card, and put it into your hand only when it is an instant or a sorcery', () => {
  const dowser = load('Leyline Dowser');
  const build = (top: string) =>
    scenario()
      .define(dowser)
      .seat(0)
      .library(top, 'Island', 'Island')
      .battlefield(dowser.name)
      .pool('U')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const spell = build('Lightning Bolt');
  spell.act(0).activate(dowser.name, { ability: 0, pay: true });
  spell.passAll();
  spell.act(0).accept();
  spell.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
  const land = build('Plains');
  land.act(0).activate(dowser.name, { ability: 0, pay: true });
  land.passAll();
  land.expect.zone('Plains', 'graveyard', { seat: 0 });
  expect(land.state.seats[0]?.hand).toHaveLength(0);
});

test('Midnight Clock: the twelfth hour counter shuffles the hand and graveyard into the library, draws seven and exiles it', () => {
  const clock = load('Midnight Clock');
  const build = (hours: number) =>
    scenario()
      .define(clock)
      .seat(0)
      .library(...FILLER, ...FILLER, ...FILLER)
      .hand('Plains', 'Plains')
      .graveyard('Lightning Bolt')
      .battlefield(clock.name, { counters: { hour: hours } })
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  // The eleventh counter is not enough: {2}{U}: put an hour counter on it makes twelve.
  const g = build(11);
  g.act(0).activate(clock.name, { ability: 1, pay: true });
  g.passAll();
  expect(g.state.seats[0]?.hand).toHaveLength(7);
  expect(g.state.seats[0]?.graveyard).toHaveLength(0);
  g.expect.zone(clock.name, 'exile');
  g.expect.invariants();
  // The tenth counter and the eleventh trigger nothing.
  const quiet = build(9);
  quiet.act(0).activate(clock.name, { ability: 1, pay: true });
  quiet.passAll();
  expect(quiet.state.seats[0]?.hand).toHaveLength(2);
  quiet.expect.zone(clock.name, 'battlefield');
});

// ---- Casting for free

test('Epic Experiment: exile the top X, cast the instants and sorceries with mana value X or less for free, and the rest go to the graveyard', () => {
  const experiment = load('Epic Experiment');
  const g = scenario()
    .define(experiment)
    .seat(0)
    .library('Lightning Bolt', 'Divination', 'Island', 'Island', 'Island')
    .hand(experiment.name)
    .pool('UURR')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(experiment.name, { x: 2, pay: true });
  g.passAll();
  // Only the Bolt (mana value 1) is offered: Divination has mana value 3, more than X.
  g.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'exile' });
  g.act(0).chooseTargets({ player: 1 });
  g.passAll();
  g.expect.life(1, 37);
  // The Divination that was not cast goes to the graveyard with nothing left in exile.
  g.expect.zone('Divination', 'graveyard', { seat: 0 });
  expect(g.state.exile).toHaveLength(0);
  g.expect.invariants();
});

test('Mizzix’s Mastery: exile an instant or sorcery from your graveyard, copy it and cast the copy free; overloaded, every one of them', () => {
  const mastery = load("Mizzix's Mastery");
  const build = (pool: string) =>
    scenario()
      .define(mastery)
      .seat(0)
      .library(...FILLER)
      .hand(mastery.name)
      .graveyard('Lightning Bolt', 'Divination')
      .pool(pool)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const one = build('RRRR');
  one
    .act(0)
    .cast(mastery.name, { pay: true, targets: [{ name: 'Lightning Bolt', zone: 'graveyard' }] });
  one.passAll();
  // The copy is the second Lightning Bolt in exile (the card exiled came first).
  one.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'exile', nth: 1 });
  one.act(0).chooseTargets({ player: 1 });
  one.passAll();
  one.expect.life(1, 37);
  // The card exiled stays exiled, and Mizzix's Mastery exiles itself.
  one.expect.zone('Lightning Bolt', 'exile');
  one.expect.zone(mastery.name, 'exile');
  one.expect.zone('Divination', 'graveyard', { seat: 0 });
  one.expect.invariants();
  // Overload {5}{R}{R}{R}: both cards are exiled and copied.
  const all = build('RRRRRRRR');
  all.act(0).cast(mastery.name, { alternative: 'overload', pay: true });
  all.passAll();
  all.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'exile', nth: 1 });
  all.act(0).chooseTargets({ player: 1 });
  all.expect.zone('Lightning Bolt', 'exile');
  all.expect.zone('Divination', 'exile');
});

test('Arcane Bombardment: the first instant or sorcery each turn exiles one from the graveyard at random, and its copy may be cast free', () => {
  const bombardment = load('Arcane Bombardment');
  const g = scenario()
    .define(bombardment)
    .seat(0)
    .library(...FILLER)
    .battlefield(bombardment.name)
    .hand('Divination', 'Divination')
    .graveyard('Lightning Bolt')
    .pool('UUUUUU')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast({ name: 'Divination', nth: 0 }, { pay: true });
  // The Divination, and the trigger above it: the only card in the graveyard is the one it exiles.
  expect(g.state.stack).toHaveLength(2);
  g.passAll();
  g.act(0).chooseCards({ name: 'Lightning Bolt', zone: 'exile', nth: 1 });
  g.act(0).chooseTargets({ player: 1 });
  g.passAll();
  g.expect.life(1, 37);
  g.expect.zone('Lightning Bolt', 'exile');
  g.expect.invariants();
  // The second spell of the turn does not trigger it.
  g.act(0).cast('Divination', { pay: true });
  expect(g.state.stack).toHaveLength(1);
});

test('Forger’s Foundry: its mana pays for a cheap spell that is exiled with it, and later the exiled spells are cast free', () => {
  const foundry = load("Forger's Foundry");
  const g = scenario()
    .define(foundry)
    .seat(0)
    .library(...FILLER, ...FILLER)
    .battlefield(foundry.name)
    .battlefield('Island', { count: 2 })
    .battlefield('Island', { count: 5, tapped: true })
    .hand('Divination')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  // Divination ({2}{U}) paid with the Foundry's mana and two Islands.
  g.act(0).cast('Divination', { pay: true });
  expect(g.state.stack.length).toBeGreaterThanOrEqual(2);
  g.pass();
  g.pass();
  g.act(0).accept();
  g.passAll();
  g.expect.zone('Divination', 'exile');
  // In a later turn: {3}{U}{U}, {T} casts it free from among the cards exiled with the Foundry.
  g.advanceTo('precombatMain', { turn: 'next' });
  g.advanceTo('precombatMain', { turn: 'next' });
  g.act(0).activate(foundry.name, { ability: 1, pay: true });
  g.passAll();
  g.act(0).chooseCards({ name: 'Divination', zone: 'exile' });
  g.passAll();
  expect(g.state.seats[0]?.hand.length).toBeGreaterThanOrEqual(2);
  g.expect.invariants();
});

test('Bloodthirsty Adversary: pay {2}{R} any number of times for counters, and exile, copy and cast that many cheap spells', () => {
  const adversary = load('Bloodthirsty Adversary');
  const g = scenario()
    .define(adversary)
    .seat(0)
    .library(...FILLER)
    .hand(adversary.name)
    .graveyard('Lightning Bolt', 'Divination')
    .pool('RRRRRRRRR')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(adversary.name, { pay: true });
  g.passAll();
  g.act(0).chooseX(2);
  g.act(0).payAuto();
  g.passAll();
  g.act(0).chooseTargets(
    { name: 'Lightning Bolt', zone: 'graveyard' },
    { name: 'Divination', zone: 'graveyard' },
  );
  g.passAll();
  g.expect.pt(adversary.name, 4, 4);
  g.expect.zone('Lightning Bolt', 'exile');
  g.expect.invariants();
});

test('Finale of Promise: cast an instant and a sorcery with mana value X or less from the graveyard for free, and they are exiled afterwards', () => {
  const finale = load('Finale of Promise');
  const g = scenario()
    .define(finale)
    .seat(0)
    .library(...FILLER)
    .hand(finale.name)
    .graveyard('Lightning Bolt', 'Divination')
    .pool('RRRRR')
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(finale.name, {
    x: 3,
    pay: true,
    targets: [
      { name: 'Lightning Bolt', zone: 'graveyard' },
      { name: 'Divination', zone: 'graveyard' },
    ],
  });
  g.passAll();
  g.act(0).accept();
  g.act(0).chooseTargets({ player: 1 });
  g.passAll();
  g.act(0).accept();
  g.passAll();
  g.expect.life(1, 37);
  g.expect.zone('Lightning Bolt', 'exile');
  g.expect.zone('Divination', 'exile');
  g.expect.invariants();
});
