// Delayed triggered abilities (CR 603.7, D-128): "You draw a card at the beginning of the next turn's upkeep."
// Pins: CR 603.7 (an effect creates a delayed triggered ability that does something at a later time), CR 603.7a (it
// does not trigger until created, even if its trigger event occurred just beforehand), CR 603.7b (it triggers only
// once, the next time its trigger event occurs), CR 603.7c and 603.7d (the spell is the source; the controller of
// the spell as it resolved controls it), CR 603.7e, CR 603.3b (the controller orders triggers), CR 400.7. Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-later.ts).
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/index';
import {
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const INSIGHT = 'SYNTHETIC Delayed Insight'; // instant {1}{U}: you draw a card at the beginning of the next turn's upkeep
const WINDFALL = 'SYNTHETIC Delayed Windfall'; // sorcery {2}{G}: you draw two cards at the beginning of your next upkeep
const TITHE = 'SYNTHETIC Delayed Tithe'; // sorcery {W}: you gain 3 life at the beginning of the next end step
const DRAIN = 'SYNTHETIC Delayed Drain'; // sorcery {1}{B}: each opponent loses 2 life at the next turn's upkeep
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0's precombat main phase of turn 1 with `hand` and enough lands of each color; both libraries are stocked. */
function game(configure: (b: Builder) => Builder = (b) => b) {
  return configure(
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Island', { count: 3 })
      .battlefield('Forest', { count: 3 })
      .battlefield('Plains', { count: 2 })
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

const resolveTop = (g: ReturnType<typeof game>): void => {
  g.pass();
  g.pass();
};

describe('creating the delayed triggered ability (CR 603.7)', () => {
  test('resolving the spell creates it; nothing is drawn yet', () => {
    const g = game((b) => b.seat(0).hand(INSIGHT).seat(0));
    g.act(0).cast(INSIGHT, { pay: true });
    expect(g.state.delayedTriggers).toEqual([]); // still on the stack
    resolveTop(g);
    expect(g.state.delayedTriggers).toHaveLength(1);
    expect(g.state.delayedTriggers[0]?.controller).toBe(0);
    g.expect.handSize(0, 0);
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('it triggers at the beginning of the next turn’s upkeep, whoever’s turn it is, and its controller draws', () => {
    const g = game((b) => b.seat(0).hand(INSIGHT).seat(0));
    g.act(0).cast(INSIGHT, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 2 });
    // Seat 1's upkeep: the trigger belongs to seat 0 (CR 603.7d).
    g.expect.stack([`${INSIGHT} (ability)`]);
    expect(g.state.delayedTriggers).toEqual([]); // it has triggered: it is gone (CR 603.7b)
    expect(getView(g.state, 1).stack[0]?.name).toBe(INSIGHT);
    g.expect.handSize(0, 0);
    resolveTop(g);
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('it triggers only once (CR 603.7b)', () => {
    const g = game((b) => b.seat(0).hand(INSIGHT).seat(0));
    g.act(0).cast(INSIGHT, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    resolveTop(g);
    g.expect.handSize(0, 1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
  });

  test('cast during an upkeep: that upkeep has begun, so the next turn’s upkeep is the one (CR 603.7a)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(INSIGHT)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([]);
    g.act(0).cast(INSIGHT, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.handSize(0, 0);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 4 });
    g.expect.stack([`${INSIGHT} (ability)`]);
  });

  test('"your next upkeep" waits for its controller’s turn: the opponent’s upkeep does not trigger it', () => {
    const g = game((b) => b.seat(0).hand(WINDFALL).seat(0));
    g.act(0).cast(WINDFALL, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 2 });
    g.expect.stack([]);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0, turn: 3 });
    g.expect.stack([`${WINDFALL} (ability)`]);
    resolveTop(g);
    g.expect.handSize(0, 2); // the two cards of the trigger; the draw step comes after the upkeep
  });

  test('another step: "at the beginning of the next end step" works the same way', () => {
    const g = game((b) => b.seat(0).hand(TITHE).seat(0));
    g.act(0).cast(TITHE, { pay: true });
    resolveTop(g);
    g.advanceTo('end');
    g.expect.stack([`${TITHE} (ability)`]);
    resolveTop(g);
    g.expect.life(0, 23);
  });

  test('a player effect other than drawing: each opponent loses life', () => {
    const g = game((b) => b.seat(0).hand(DRAIN).seat(0));
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${DRAIN} (ability)`]);
    resolveTop(g);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
  });
});

describe('what happens to the source (CR 603.7c, 603.7d, 400.7)', () => {
  test('the spell is already in the graveyard when the ability triggers, and it still resolves', () => {
    const g = game((b) => b.seat(0).hand(INSIGHT).seat(0));
    g.act(0).cast(INSIGHT, { pay: true });
    resolveTop(g);
    g.expect.zone(INSIGHT, 'graveyard', { seat: 0 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${INSIGHT} (ability)`]);
    // Last-known information names the source; the spell card is still where it went.
    g.expect.zone(INSIGHT, 'graveyard', { seat: 0 });
    resolveTop(g);
    g.expect.handSize(0, 1);
  });

  test('a countered spell creates nothing', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(INSIGHT)
        .seat(1)
        .hand('Counterspell')
        .battlefield('Island', { count: 2 })
        .seat(0),
    );
    g.act(0).cast(INSIGHT, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [INSIGHT], pay: true });
    g.passAll();
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([]);
  });

  test('two of them trigger together and their controller orders them (CR 603.3b)', () => {
    const g = game((b) => b.seat(0).hand(INSIGHT, DRAIN).seat(0));
    g.act(0).cast(INSIGHT, { pay: true });
    resolveTop(g);
    g.act(0).cast(DRAIN, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${DRAIN} (ability)`, `${INSIGHT} (ability)`]);
  });

  test('both players have one: each controls its own', () => {
    const g = game((b) =>
      b.seat(0).hand(INSIGHT).seat(1).hand(INSIGHT).battlefield('Island', { count: 2 }).seat(0),
    );
    g.act(0).cast(INSIGHT, { label: 'a', pay: true } as never);
    resolveTop(g);
    g.act(0).pass();
    g.act(1).cast(INSIGHT, { pay: true });
    resolveTop(g);
    expect(g.state.delayedTriggers.map((d) => d.controller).sort()).toEqual([0, 1]);
  });
});

describe('determinism and the state hash', () => {
  test('the same plays give the same hash; the delayed trigger is part of the state', () => {
    const run = () => {
      const g = game((b) => b.seat(0).hand(INSIGHT).seat(0));
      g.act(0).cast(INSIGHT, { pay: true });
      resolveTop(g);
      return g;
    };
    const a = run();
    const b = run();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    const plain = game();
    expect(stateHash(plain.state)).not.toBe(stateHash(a.state));
  });
});

describe('validation: what a delayed effect may name (CR 603.7c)', () => {
  const card = (
    effect: Effect,
    at: { step: string; whose: string } = { step: 'upkeep', whose: 'each' },
  ) => {
    const base = syntheticCard(INSIGHT);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...base,
      faces: [
        {
          ...face,
          spell: { effect: { kind: 'delayedTrigger', at, effect } },
        },
      ],
    } as never;
  };
  const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };

  test('the real shape is valid and supported', () => {
    expect(validateCard(syntheticCard(INSIGHT))).toEqual([]);
    expect(isFeatureSupported('effect:delayedTrigger')).toBe(true);
    expect(SUPPORTED_FEATURES.effectKinds).toContain('delayedTrigger');
  });

  test.each([
    [
      'an object of the spell',
      { kind: 'destroy', objects: { kind: 'this' } } as Effect,
      'may draw, gain life, lose life or deal damage only',
    ],
    [
      'a nested delayed trigger',
      { kind: 'delayedTrigger', at: { step: 'upkeep', whose: 'you' }, effect: draw } as Effect,
      'may draw, gain life, lose life or deal damage only',
    ],
    [
      'a target player',
      { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 1 } as Effect,
      'names players only',
    ],
    [
      'an X amount',
      { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } } as Effect,
      'fixed amount',
    ],
    [
      'the controller of an object',
      { kind: 'draw', player: { kind: 'controllerOf', of: { kind: 'this' } }, count: 1 } as Effect,
      'names players only',
    ],
    [
      'a zero amount',
      { kind: 'draw', player: { kind: 'you' }, count: 0 } as Effect,
      'fixed amount',
    ],
  ])('%s is refused with a reason', (_name, effect, reason) => {
    expect(JSON.stringify(validateCard(card(effect)))).toContain(reason);
  });

  test('an unknown step or turn is refused', () => {
    expect(JSON.stringify(validateCard(card(draw, { step: 'never', whose: 'each' })))).toContain(
      'unknown step',
    );
    expect(
      JSON.stringify(validateCard(card(draw, { step: 'upkeep', whose: 'opponent' }))),
    ).toContain('turn of');
  });
});
