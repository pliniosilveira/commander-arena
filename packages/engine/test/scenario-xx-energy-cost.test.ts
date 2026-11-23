// "Pay {E}" as the cost of an activated ability and of a mana ability (issue 105).
// Pins: CR 107.14 (the energy symbol is one energy counter; paying it removes one from the player), CR 118.3 (a player can't pay a cost
// they can't pay in full), CR 605.3 (a mana ability's costs are paid as it is activated, with no stack).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-energy.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const CELL = 'SYNTHETIC Energy Cell';
const SCRIBE = 'SYNTHETIC Energy Scribe';

describe('an activated ability that costs {E}{E}', () => {
  test('it removes two energy counters and draws', () => {
    const g = scenario().seat(0).energy(3).battlefield(SCRIBE).library('Island', 'Island').build();
    g.act(0).activate(SCRIBE);
    g.expect.energy(0, 1);
    g.pass();
    g.pass(1);
    g.expect.handSize(0, 1);
  });

  test('it is not offered with fewer counters than the cost, and is refused with a reason', () => {
    const g = scenario().seat(0).energy(1).battlefield(SCRIBE).library('Island').build();
    g.expect.illegal(0, { activate: SCRIBE });
    const r = g.act(0).try.activate(SCRIBE);
    expect(r.ok).toBe(false);
    g.expect.energy(0, 1);
  });

  test('a player with no energy counters at all cannot pay it', () => {
    const g = scenario().seat(0).battlefield(SCRIBE).library('Island').build();
    g.expect.illegal(0, { activate: SCRIBE });
  });
});

describe('a mana ability that costs {E}', () => {
  test('it taps, removes one counter and adds the mana at once', () => {
    const g = scenario().seat(0).energy(2).battlefield(CELL).build();
    g.act(0).tapForMana(CELL, { color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.energy(0, 1);
    g.expect.stack([]);
  });

  test('without energy it is not offered', () => {
    const g = scenario().seat(0).battlefield(CELL).build();
    g.expect.illegal(0, { tap: CELL });
    const r = g.act(0).try.tapForMana(CELL, { color: 'U' });
    expect(r.ok).toBe(false);
  });

  test('automatic payment never spends more energy than the player has', () => {
    // Two cells and one counter: only one of them can help pay {1}{1}, so a two-mana spell is not castable by them alone.
    const g = scenario().seat(0).energy(1).battlefield(CELL, CELL).hand('Grizzly Bears').build();
    g.expect.illegal(0, { cast: 'Grizzly Bears' });
  });
});
