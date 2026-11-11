// Stun counters (CR 122.1d) and "attacks while ..." as a condition of the trigger event (CR 603.2) (D-145).
// Pins: CR 122.1d (One or more stun counters on a permanent create a single replacement effect that stops the permanent from untapping:
// "If a permanent with a stun counter on it would become untapped, instead remove a stun counter from it."), CR 502.3 (the untap step),
// CR 603.2 (a trigger event, here with a state condition), CR 603.4 (an intervening "if" is checked again as the ability resolves).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-stun.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const FREEZE = 'SYNTHETIC Freeze Bolt';
const ROUSE = 'SYNTHETIC Rouse';
const SLOW = 'SYNTHETIC Slow Raptor';
const CAREFUL = 'SYNTHETIC Careful Raptor';
const LITTLE = 'SYNTHETIC Little Dinosaur';
const FLASH = 'SYNTHETIC Flash Dinosaur';
const BEARS = 'Grizzly Bears';

describe('the cards are valid', () => {
  test.each([FREEZE, ROUSE, SLOW, CAREFUL, LITTLE, FLASH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0's game at the end of seat 1's turn: seat 0's creature `label` is tapped with `stun` stun counters. */
function stunned(stun: number): ScenarioGame {
  return scenario()
    .seat(0)
    .battlefield(BEARS, { label: 'bears', tapped: true, counters: stun > 0 ? { stun } : {} })
    .library('Island', 'Island', 'Island')
    .seat(1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
}

describe('CR 122.1d: a stun counter replaces untapping', () => {
  test('the untap step removes the counter and the creature stays tapped', () => {
    const g = stunned(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.counters('bears', {});
  });

  test('the next untap step untaps it as usual', () => {
    const g = stunned(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });

  test('two counters are a single replacement effect: one is removed each time it would untap', () => {
    const g = stunned(2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.counters('bears', { stun: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.counters('bears', {});
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });

  test('without a counter the creature untaps in its controller untap step', () => {
    const g = stunned(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });

  test("only its controller's untap step untaps it: the opponent's untap step does nothing to it", () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { label: 'bears', tapped: true, counters: { stun: 1 } })
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    // Seat 1's untap step: seat 0's creature is not untapped, and its counter is not touched.
    g.expect.tapped('bears', true);
    g.expect.counters('bears', { stun: 1 });
  });

  test('an untapped creature with a counter keeps it: nothing would become untapped', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, { label: 'bears', counters: { stun: 1 } })
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.counters('bears', { stun: 1 });
    g.expect.tapped('bears', false);
  });

  test('an effect that untaps it removes a counter instead (CR 701.26b)', () => {
    const g = scenario()
      .seat(0)
      .hand(ROUSE)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'bears', tapped: true, counters: { stun: 1 } })
      .build();
    g.act(0).cast(ROUSE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    g.expect.counters('bears', {});
    g.expect.eventLog([{ kind: 'counterRemoved', counter: 'stun' }]);
  });

  test('a spell can put the counter on: tap and stun, and the creature then stays tapped', () => {
    const g = scenario()
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .library('Island', 'Island')
      .seat(0)
      .hand(FREEZE)
      .battlefield('Island')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(FREEZE, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    g.expect.counters('bears', { stun: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.counters('bears', {});
  });
});

describe('"Whenever it attacks while you don\'t control another Dinosaur" (CR 603.2)', () => {
  const attack = (g: ScenarioGame, name: string) => {
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(name);
  };

  test('alone among Dinosaurs, it gets a stun counter as it attacks', () => {
    const g = scenario().seat(0).battlefield(SLOW).seat(1).build();
    attack(g, SLOW);
    g.expect.stack([`${SLOW} (ability)`]);
    g.passAll();
    g.expect.counters(SLOW, { stun: 1 });
  });

  test('with another Dinosaur on your side, nothing triggers', () => {
    const g = scenario().seat(0).battlefield(SLOW, LITTLE).seat(1).build();
    attack(g, SLOW);
    g.expect.stack([]);
    g.expect.counters(SLOW, {});
  });

  test("another player's Dinosaur does not count", () => {
    const g = scenario().seat(0).battlefield(SLOW).seat(1).battlefield(LITTLE).build();
    attack(g, SLOW);
    g.expect.stack([`${SLOW} (ability)`]);
  });

  test('the condition is part of the event: a Dinosaur cast in response does not stop the counter', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SLOW)
      .hand(FLASH)
      .battlefield('Mountain')
      .seat(1)
      .build();
    attack(g, SLOW);
    g.expect.stack([`${SLOW} (ability)`]);
    g.act(0).cast(FLASH, { pay: true });
    g.passAll();
    g.expect.counters(SLOW, { stun: 1 });
  });

  test('an intervening "if" is checked again as it resolves: the same play makes the ability do nothing (CR 603.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CAREFUL)
      .hand(FLASH)
      .battlefield('Mountain')
      .seat(1)
      .build();
    attack(g, CAREFUL);
    g.expect.stack([`${CAREFUL} (ability)`]);
    g.act(0).cast(FLASH, { pay: true });
    g.passAll();
    g.expect.counters(CAREFUL, {});
  });
});
