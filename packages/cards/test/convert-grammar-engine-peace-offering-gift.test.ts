// The Peace Offering deck (issue 112), the gift group: the REAL Oracle text of Jolly Gerbils, Octomancer and Perch Protection (the corpus's golden.jsonl, taken from the issue) goes
// through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text
// are what the engine runs. Pins: CR 702.174c (a player gives a gift as the gift ability of their permanent resolves), CR 702.174i (an 8/8 blue Octopus for the chosen
// player), CR 702.174g (an extra turn after this one), CR 500.7 (extra turns), CR 702.26 (phasing), CR 702.16 (a player's protection from everything), CR 119.10 (a life
// total that can't change), CR 707.2 (a copy of a token copies what the effect that created it defined), CR 400.7 (entered this turn).
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

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const gerbils = real('Jolly Gerbils');
const octomancer = real('Octomancer');
const GERBILS = gerbils.name;
const OCTOMANCER = octomancer.name;

/** Seat 0 has Jolly Gerbils when `withGerbils`, five lands and Octomancer in hand; the other seats have a library. */
function start(seats: 2 | 3, withGerbils: boolean) {
  const b = scenario({ seats }).define(gerbils).define(octomancer);
  b.seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(OCTOMANCER)
    .battlefield('Forest', { count: 2 })
    .battlefield('Island', { count: 3 });
  if (withGerbils) b.battlefield(GERBILS);
  for (let seat = 1; seat < seats; seat += 1) {
    b.seat(seat)
      .life(20)
      .library(...LIBRARY);
  }
  return b.at('precombatMain', { active: 0, priority: 0 }).build();
}

describe('the cards', () => {
  test('both are valid', () => {
    expect(validateCard(gerbils)).toEqual([]);
    expect(validateCard(octomancer)).toEqual([]);
  });
});

describe('Octomancer and Jolly Gerbils', () => {
  test("promised: the opponent gets the Octopus, Gerbils draws, and the end step copies the Octopus for Octomancer's controller", () => {
    const g = start(2, true);
    g.act(0).cast(OCTOMANCER, { gift: true, pay: true });
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 1, count: 1 });
    g.expect.pt('Octopus', 8, 8);
    g.expect.handSize(0, 1);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt({ name: 'Octopus', seat: 0 }, 8, 8);
    g.expect.invariants();
  });

  test('not promised: no Octopus, no card for Gerbils, and nothing to copy at the end step', () => {
    const g = start(2, true);
    g.act(0).cast(OCTOMANCER, { gift: false, pay: true });
    g.passAll();
    g.expect.noObject('Octopus');
    g.expect.handSize(0, 0);
    g.advanceTo('end');
    g.expect.stack([]);
  });

  test('3 seats: the Octopus goes to the opponent promised, and the copy is made at each end step it entered in only', () => {
    const g = start(3, false);
    g.act(0).cast(OCTOMANCER).gift(false).gift(true).pay();
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 2, count: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 0, count: 1 });
    // The next turn's end step: both Octopuses entered on an earlier turn, so the ability has no target.
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Octopus', 'battlefield', { seat: 2, count: 1 });
  });
});

describe('Perch Protection', () => {
  const perch = real('Perch Protection');
  const PERCH = perch.name;
  const BOLT = 'Lightning Bolt';

  /** Seat 0 has Perch Protection, six Plains and a Grizzly Bears; each other seat has a Mountain and a Lightning Bolt. */
  const begin = (seats: 2 | 3) => {
    const b = scenario({ seats }).define(perch).define(gerbils);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(PERCH)
      .battlefield('Plains', { count: 6 })
      .battlefield(GERBILS);
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat)
        .life(20)
        .library(...LIBRARY)
        .hand(BOLT)
        .battlefield('Mountain');
    }
    return b.at('precombatMain', { active: 0, priority: 0 }).build();
  };

  /** Whether a spell `seat` begins to cast could target the player `target`; the cast is cancelled. */
  const canTarget = (g: ReturnType<typeof begin>, seat: number, target: number): boolean => {
    g.act(seat).cast(BOLT);
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
    const legal = pending.specs[0]?.legal.some((t) => t.kind === 'player' && t.seat === target);
    g.act(seat).cancel();
    return legal === true;
  };

  test('the card is valid', () => {
    expect(validateCard(perch)).toEqual([]);
  });

  test('not promised: four Birds, nothing phases out, no extra turn, and the card is exiled', () => {
    const g = begin(2);
    g.act(0).cast(PERCH, { gift: false, pay: true });
    g.passAll();
    g.expect.zone('Bird', 'battlefield', { seat: 0, count: 4 });
    g.expect.pt('Bird[0]', 2, 2);
    g.expect.zone(PERCH, 'exile', { seat: 0 });
    g.expect.zone(GERBILS, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 0);
    expect(g.state.extraTurns ?? []).toEqual([]);
  });

  test('promised: the opponent takes an extra turn, everything of the caster phases out, and the caster is protected until their next turn', () => {
    const g = begin(2);
    g.act(0).cast(PERCH, { gift: true, pay: true });
    g.passAll();
    g.expect.zone(PERCH, 'exile', { seat: 0 });
    // The Birds are created before the permanents phase out, so they phase out too (CR 702.26b).
    g.expect.zone('Bird', 'phased', { seat: 0, count: 4 });
    g.expect.zone('Plains', 'phased', { seat: 0, count: 6 });
    g.expect.zone(GERBILS, 'phased', { seat: 0 });
    // Jolly Gerbils saw the gift given before it phased out: the gift comes first (CR 702.174j).
    g.expect.handSize(0, 1);
    expect(g.state.extraTurns).toEqual([1]);
    // The extra turn: the caster can't be targeted and their permanents stay phased out.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    expect(canTarget(g, 1, 0)).toBe(false);
    g.expect.zone('Plains', 'phased', { seat: 0, count: 6 });
    // The opponent's own turn follows (CR 500.7), still before the caster's next turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    expect(canTarget(g, 1, 0)).toBe(false);
    // The caster's next turn: everything phases in as the untap step begins, and the protection is over.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    g.expect.zone('Bird', 'battlefield', { seat: 0, count: 4 });
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 6 });
    g.act(0).pass();
    expect(canTarget(g, 1, 0)).toBe(true);
  });

  test('3 seats: the extra turn goes to the opponent promised, and no opponent can target the caster', () => {
    const g = begin(3);
    g.act(0).cast(PERCH).gift(false).gift(true).pay();
    g.passAll();
    expect(g.state.extraTurns).toEqual([2]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 2 });
    expect(canTarget(g, 2, 0)).toBe(false);
    expect(canTarget(g, 2, 1)).toBe(true);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    expect(canTarget(g, 1, 0)).toBe(false);
  });
});

// The same two lines read for Perch Protection make Teferi's Protection (a real card of the corpus) supported: it is played here too.
describe("Teferi's Protection", () => {
  const teferi = real("Teferi's Protection");
  const TEFERI = teferi.name;

  test('the controller is locked and protected, everything they control phases out, and the card is exiled; all of it ends as their next turn begins', () => {
    expect(validateCard(teferi)).toEqual([]);
    const b = scenario().define(teferi);
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(TEFERI)
      .battlefield('Plains', { count: 3 })
      .battlefield('Grizzly Bears');
    b.seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand('Lightning Bolt')
      .battlefield('Mountain');
    const g = b.at('precombatMain', { active: 0, priority: 0 }).build();
    g.act(0).cast(TEFERI, { pay: true });
    g.passAll();
    g.expect.zone(TEFERI, 'exile', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'phased', { seat: 0 });
    g.expect.zone('Plains', 'phased', { seat: 0, count: 3 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast('Lightning Bolt');
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
    expect(pending.specs[0]?.legal.some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
    g.act(1).cancel();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 3 });
    g.expect.life(0, 20);
  });
});
