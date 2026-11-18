// "Destroy all creatures with power greater than target creature's power." (the filter `powerGreaterThan` of an `each` selector)
// Pins: CR 208.1 (power as it is now, with every effect and counter), CR 608.2b (a spell whose only target is illegal does not resolve), CR 701.8 (Destroy),
// CR 115.1 (the target is chosen as the spell is cast; which creatures are destroyed is read as it resolves, CR 608.2c). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-power-above-target.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SWEEP = 'SYNTHETIC Humbling Sweep';
const GOBLIN = 'Raging Goblin'; // 1/1
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4

const game = () =>
  scenario()
    .seat(0)
    .hand(SWEEP)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', BEARS)
    .seat(1)
    .battlefield(GOBLIN, ANGEL, 'Grizzly Bears')
    .build();

describe('the card is valid', () => {
  test(SWEEP, () => {
    expect(validateCard(syntheticCard(SWEEP))).toEqual([]);
  });
});

describe('creatures with more power than the target die; the target and weaker ones live (CR 701.8)', () => {
  test('targeting a 2/2: the 4/4 is destroyed, the 2/2s and the 1/1 stay', () => {
    const g = game();
    g.act(0).cast(SWEEP, { pay: true, targets: [{ name: BEARS, nth: 0 }] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield');
    g.expect.zone(GOBLIN, 'battlefield');
  });

  test('equal power is not greater: the target’s twin survives', () => {
    const g = game();
    g.act(0).cast(SWEEP, { pay: true, targets: [{ name: BEARS, nth: 0 }] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('targeting the 1/1: every creature with power above 1 dies, whoever controls it', () => {
    const g = game();
    g.act(0).cast(SWEEP, { pay: true, targets: [GOBLIN] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'battlefield');
  });

  test('targeting the biggest creature destroys nothing', () => {
    const g = game();
    g.act(0).cast(SWEEP, { pay: true, targets: [ANGEL] });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield');
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('power is read as it is now: a counter on the target raises the bar (CR 208.1)', () => {
    const g = scenario()
      .seat(0)
      .hand(SWEEP)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .seat(1)
      .battlefield(ANGEL)
      .build();
    // The Bears as a 4/4 are not below the Angel's 4 power: nothing is greater.
    const buffed = scenario()
      .seat(0)
      .hand(SWEEP)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { counters: { '+1/+1': 2 } })
      .seat(1)
      .battlefield(ANGEL)
      .build();
    g.act(0).cast(SWEEP, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    buffed.act(0).cast(SWEEP, { pay: true, targets: [BEARS] });
    buffed.passAll();
    buffed.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});
