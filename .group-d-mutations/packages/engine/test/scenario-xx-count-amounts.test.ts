// Counted amounts (D-095): "for each creature on the battlefield", "equal to the number of lands you
// control", "for each card in your hand" as the amount of an effect.
// Pins: CR 608.2c (instructions run in order, so the count is taken as the instruction runs, after
// everything before it, including what an earlier spell or ability did), CR 601.2a (a spell being
// cast is on the stack: it is not in the hand it came from), CR 305 / 109 (a count of permanents is
// by the filter). Cards are SYNTHETIC (src/cards/fixtures/synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const BURN = 'SYNTHETIC Crowd Burn';
const TITHE = 'SYNTHETIC Land Tithe';
const REFILL = 'SYNTHETIC Hand Refill';
const GROWTH = 'SYNTHETIC Grave Growth';
const RALLY = 'SYNTHETIC Rally Bear';

describe('countOf on the battlefield', () => {
  test('damage equals the number of creatures, whoever controls them', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', 'Grizzly Bears')
      .seat(1)
      .battlefield('Llanowar Elves', 'Giant Spider')
      .build();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(0, 40);
  });

  test('with no creature the amount is zero and nothing happens', () => {
    const g = scenario().seat(0).hand(BURN).battlefield('Mountain').seat(1).build();
    const mark = g.mark();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    expect(g.eventsSince(mark).some((e) => e.kind === 'damageDealt')).toBe(false);
    g.expect.invariants();
  });

  test('a creature types filter does not count a noncreature permanent', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', 'Sol Ring')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 39);
  });

  test('it is counted when the spell resolves, not when it is cast (CR 608.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN, 'Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Llanowar Elves', 'Giant Spider', 'Grizzly Bears')
      .build();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    // Holding priority, seat 0 kills the Elves in response: three creatures become two.
    g.act(0).cast('Lightning Bolt', { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.life(1, 38);
  });

  test('"lands you control" counts only the controller’s lands, tapped or not', () => {
    const g = scenario()
      .seat(0)
      .hand(TITHE)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .battlefield('Swamp', { count: 5 })
      .build();
    g.act(0).cast(TITHE, { pay: true });
    g.passAll();
    // Two Forests were tapped to pay; they still count.
    g.expect.life(0, 44);
  });

  test('"other" leaves out the source: a creature entering counts the creatures you control besides it', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY)
      .battlefield('Plains', { count: 3 })
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
  });

  test('the first creature you control gains nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(RALLY)
      .battlefield('Plains', { count: 3 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });
});

describe('countOf in other zones', () => {
  test('"each card in your hand": the spell being cast is not in the hand (CR 601.2a)', () => {
    const g = scenario()
      .seat(0)
      .hand(REFILL, 'Forest', 'Forest', 'Island')
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(REFILL, { pay: true });
    g.passAll();
    // Three cards remained in the hand, so three were drawn: 3 + 3.
    g.expect.handSize(0, 6);
    g.expect.librarySize(0, 1);
  });

  test('the hand is counted for its owner only', () => {
    const g = scenario()
      .seat(0)
      .hand(REFILL)
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains')
      .seat(1)
      .hand('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    g.act(0).cast(REFILL, { pay: true });
    g.passAll();
    // The hand is empty once the spell is cast: nothing is drawn.
    g.expect.handSize(0, 0);
    g.expect.librarySize(0, 2);
  });

  test('"creature cards in your graveyard" puts that many counters on a target', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWTH)
      .graveyard('Grizzly Bears', 'Llanowar Elves', 'Lightning Bolt')
      .battlefield('Forest', { count: 2 })
      .battlefield('Giant Spider')
      .seat(1)
      .graveyard('Grizzly Bears')
      .build();
    g.act(0).cast(GROWTH, { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.counters('Giant Spider', { '+1/+1': 2 });
  });

  test('an empty graveyard puts no counters at all', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWTH)
      .battlefield('Forest', { count: 2 })
      .battlefield('Giant Spider')
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast(GROWTH, { targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.counters('Giant Spider', {});
    expect(g.eventsSince(mark).some((e) => e.kind === 'counterAdded')).toBe(false);
  });
});
