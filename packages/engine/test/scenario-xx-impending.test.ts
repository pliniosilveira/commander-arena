// Impending (issue 81, Overlord of the Mistmoors): "If you cast this spell for its impending cost, it enters with N time counters and isn't a creature until the last is removed. At the
// beginning of your end step, remove a time counter from it." Pins: CR 702.176a (Impending), CR 118.9 (an alternative cost), CR 122.1 (counters), CR 205.1 and 613.1d (a layer 4 type
// change), CR 603.4 (an intervening "if"), CR 400.7 (a new object after a zone change). The card is SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const OVERLORD = 'SYNTHETIC Impending Overlord';

const overlord = singleFaceCard({
  name: OVERLORD,
  manaCost: ['3', 'W', 'W'],
  types: ['enchantment', 'creature'],
  subtypes: ['Avatar', 'Horror'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 5,
  toughness: 5,
  oracleText: 'Impending 4—{1}{W}',
  alternativeCosts: [
    { kind: 'impending', cost: [{ kind: 'mana', symbols: ['1', 'W'] }], counters: 4 },
  ],
});

const isCreature = (g: ReturnType<typeof board>) => {
  const view = getView(g.state, 0);
  const card = view.battlefield.find((p) => p.name === OVERLORD);
  return card?.types.includes('creature') ?? false;
};

function board() {
  return scenario()
    .seat(0)
    .define(overlord)
    .hand(OVERLORD)
    .battlefield('Plains', { count: 5 })
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('impending', () => {
  test('cast for the impending cost it enters with four time counters and is not a creature', () => {
    const g = board();
    g.act(0).cast(OVERLORD, { alternative: 'impending', pay: true });
    g.passAll();
    g.expect.counters(OVERLORD, { time: 4 });
    expect(isCreature(g)).toBe(false);
    g.expect.invariants();
  });

  test('the ordinary cast has no counters and is a creature', () => {
    const g = board();
    g.act(0).cast(OVERLORD, { pay: true });
    g.passAll();
    g.expect.counters(OVERLORD, {});
    expect(isCreature(g)).toBe(true);
  });

  test("a time counter comes off at the beginning of its controller's end step, not an opponent's", () => {
    const g = board();
    g.act(0).cast(OVERLORD, { alternative: 'impending', pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(OVERLORD, { time: 3 });
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.counters(OVERLORD, { time: 3 });
  });

  test('it becomes a creature when the last counter is gone, and the ability stops', () => {
    const g = board();
    g.act(0).cast(OVERLORD, { alternative: 'impending', pay: true });
    g.passAll();
    for (let i = 0; i < 4; i += 1) {
      if (i > 0) g.advanceTo('end', { turn: 'next' }).advanceTo('end', { turn: 'next' });
      else g.advanceTo('end');
      g.passAll();
    }
    g.expect.counters(OVERLORD, {});
    expect(isCreature(g)).toBe(true);
    g.expect.invariants();
  });
});
