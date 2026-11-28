// The Peace Offering deck (issue 112), the gift group: the REAL Oracle text of Jolly Gerbils and Octomancer (the corpus's golden.jsonl, taken from the issue) goes
// through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text
// are what the engine runs. Pins: CR 702.174c (a player gives a gift as the gift ability of their permanent resolves), CR 702.174i (an 8/8 blue Octopus for the chosen
// player), CR 707.2 (a copy of a token copies what the effect that created it defined), CR 400.7 (entered this turn), CR 603.3b (the controller orders triggers).
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
