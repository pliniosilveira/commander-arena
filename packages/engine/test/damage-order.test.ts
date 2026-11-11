// The effects that modify one damage event and their order (CR 616.1, D-191): the list of what applies, the default order and the
// exact search that says whether the order matters. Pure functions on a state with shields written into it; the scenario tests of
// `scenario-xx-damage-order.test.ts` play the same cases through the game.
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/ids';
import {
  askingFlow,
  beginSettling,
  type DamageEvent,
  damageModifiers,
  damageOrderMatters,
  MAX_SEARCHED,
  quietFlow,
  settleDamage,
} from '../src/rules/damage-order';
import type { ContinuousEffect, GameState } from '../src/state/types';
import { scenario } from '../src/testing/index';

const SERAPH = 'SYNTHETIC Shielded Seraph';

interface Make {
  readonly id: string;
  readonly amount: number | 'all';
  readonly scope?: 'all' | 'combat' | 'noncombat';
  readonly players?: readonly number[];
  readonly objects?: readonly ObjectId[];
}

const shield = (m: Make, timestamp: number): ContinuousEffect => ({
  id: m.id,
  timestamp,
  objects: m.objects ?? [],
  ...(m.players === undefined && m.objects !== undefined ? {} : { players: m.players ?? [1] }),
  until: 'endOfTurn',
  change: { kind: 'preventDamage', scope: m.scope ?? 'all', amount: m.amount },
});

function withShields(base: GameState, makes: readonly Make[]): GameState {
  return { ...base, continuousEffects: makes.map((m, i) => shield(m, 100 + i)) };
}

const base = scenario().seat(0).seat(1).build().state;
const event = (amount: number, combat = false): DamageEvent => ({
  source: 'o1',
  to: { kind: 'player', seat: 1 },
  amount,
  combat,
});

const keys = (state: GameState, e: DamageEvent) => damageModifiers(state, e).map((m) => m.key);
const matters = (state: GameState, e: DamageEvent): boolean =>
  damageOrderMatters(e, beginSettling(state, e), damageModifiers(state, e));

describe('damageModifiers: what applies to one damage event, in the default order', () => {
  test('nothing applies with no shield, and nothing is left of an event of 0', () => {
    expect(keys(base, event(3))).toEqual([]);
    expect(keys(withShields(base, [{ id: 'a', amount: 3 }]), event(0))).toEqual([]);
  });

  test('a shield applies only to the recipient, the scope and the source it names', () => {
    const state = withShields(base, [
      { id: 'mine', amount: 3, players: [0] },
      { id: 'combatOnly', amount: 3, scope: 'combat' },
      { id: 'fits', amount: 3 },
    ]);
    expect(keys(state, event(2))).toEqual(['shield:fits']);
    expect(keys(state, event(2, true))).toEqual(['shield:combatOnly', 'shield:fits']);
  });

  test('the shields that prevent all damage come first, each group oldest first', () => {
    const state = withShields(base, [
      { id: 'n1', amount: 2 },
      { id: 'a1', amount: 'all' },
      { id: 'n2', amount: 5 },
      { id: 'a2', amount: 'all' },
    ]);
    expect(keys(state, event(4))).toEqual(['shield:a1', 'shield:a2', 'shield:n1', 'shield:n2']);
  });

  test('a static prevention of the creature is listed before any shield, with the index of its ability', () => {
    const g = scenario().seat(0).battlefield(SERAPH).seat(1).build();
    const seraph = g.id(SERAPH);
    const state = withShields(g.state, [{ id: 'a', amount: 'all', objects: [seraph] }]);
    const e: DamageEvent = {
      source: 'o1',
      to: { kind: 'object', id: seraph },
      amount: 3,
      combat: true,
    };
    const listed = keys(state, e);
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatch(new RegExp(`^static:${seraph}:\\d+$`));
    expect(listed[1]).toBe('shield:a');
    // Its scope is combat damage: noncombat damage is not stopped by the ability.
    expect(keys(state, { ...e, combat: false })).toEqual(['shield:a']);
  });
});

describe('settleDamage: the default order gives what the engine always gave', () => {
  const settle = (state: GameState, amount: number) => settleDamage(state, event(amount));

  test('two numeric shields: the older is used first and the rest of the older is kept in order', () => {
    const state = withShields(base, [
      { id: 'a', amount: 3 },
      { id: 'b', amount: 3 },
    ]);
    const settled = settle(state, 2);
    expect(settled.remaining).toBe(0);
    expect(
      settled.state.continuousEffects.map((e) => [e.id, (e.change as { amount: number }).amount]),
    ).toEqual([
      ['a', 1],
      ['b', 3],
    ]);
    expect(settled.events).toEqual([
      {
        kind: 'damagePrevented',
        source: 'o1',
        to: { kind: 'player', seat: 1 },
        amount: 2,
        combat: false,
      },
    ]);
  });

  test('a shield used up is gone, and what is not prevented is still to be dealt', () => {
    const state = withShields(base, [
      { id: 'a', amount: 1 },
      { id: 'b', amount: 2 },
    ]);
    const settled = settle(state, 5);
    expect(settled.remaining).toBe(2);
    expect(settled.state.continuousEffects).toEqual([]);
    expect(settled.events).toHaveLength(1);
  });

  test('a shield for all damage is not used up, and the numeric one behind it is not touched', () => {
    const state = withShields(base, [
      { id: 'n', amount: 2 },
      { id: 'a', amount: 'all' },
    ]);
    const settled = settle(state, 4);
    expect(settled.remaining).toBe(0);
    expect(
      settled.state.continuousEffects.map((e) => [
        e.id,
        (e.change as { amount: number | 'all' }).amount,
      ]),
    ).toEqual([
      ['n', 2],
      ['a', 'all'],
    ]);
  });

  test('no event is reported when no effect applied', () => {
    expect(settle(base, 3)).toMatchObject({ remaining: 3, events: [] });
  });
});

describe('damageOrderMatters: the exact search over the orders', () => {
  test('fewer than two effects: never', () => {
    expect(matters(base, event(3))).toBe(false);
    expect(matters(withShields(base, [{ id: 'a', amount: 3 }]), event(3))).toBe(false);
  });

  test('two numeric shields of different sizes matter, whatever the damage that would use both', () => {
    const state = withShields(base, [
      { id: 'a', amount: 3 },
      { id: 'b', amount: 5 },
    ]);
    // 4 damage: the 3 first leaves a 4; the 5 first leaves a 3 and a 1.
    expect(matters(state, event(4))).toBe(true);
    // 1 damage: the 3 first leaves a 2 and a 5; the 5 first leaves a 3 and a 4.
    expect(matters(state, event(1))).toBe(true);
  });

  test('two equal shields commute: the same shields are left in either order', () => {
    const state = withShields(base, [
      { id: 'a', amount: 3 },
      { id: 'b', amount: 3 },
    ]);
    expect(matters(state, event(2))).toBe(false);
    expect(matters(state, event(7))).toBe(false);
  });

  test('two shields that prevent all damage commute', () => {
    const state = withShields(base, [
      { id: 'a', amount: 'all' },
      { id: 'b', amount: 'all' },
    ]);
    expect(matters(state, event(3))).toBe(false);
  });

  test('a shield that prevents all, and a numeric one that would be used for nothing: the default order is the best, so no question', () => {
    const state = withShields(base, [
      { id: 'n', amount: 3 },
      { id: 'a', amount: 'all' },
    ]);
    expect(matters(state, event(2))).toBe(false);
  });

  test('a shield of one scope and a shield of another do not apply together, so they never ask', () => {
    const state = withShields(base, [
      { id: 'a', amount: 3, scope: 'combat' },
      { id: 'b', amount: 5, scope: 'noncombat' },
    ]);
    expect(matters(state, event(4, true))).toBe(false);
  });

  test('shields of unequal worth that cannot be told apart by the default order ask', () => {
    const state = withShields(base, [
      { id: 'a', amount: 2, scope: 'combat' },
      { id: 'b', amount: 2 },
    ]);
    // Same size, different scope: 3 combat damage uses the 2 of either first, and what is kept differs.
    expect(matters(state, event(3, true))).toBe(true);
  });

  test('more effects than the search covers ask without searching', () => {
    const many: Make[] = Array.from({ length: MAX_SEARCHED + 1 }, (_, i) => ({
      id: `s${i}`,
      amount: 'all' as const,
    }));
    // Seven shields that prevent all damage would commute, but the search is not run beyond its cap.
    expect(matters(withShields(base, many), event(3))).toBe(true);
    expect(matters(withShields(base, many.slice(0, MAX_SEARCHED)), event(3))).toBe(false);
  });
});

describe('settleDamage with answers: the question, the answer and the default', () => {
  const twoSizes = () =>
    withShields(base, [
      { id: 'a', amount: 3 },
      { id: 'b', amount: 5 },
    ]);

  test('with no answer left the question comes back, with the choices in the default order and what each leads to', () => {
    const r = settleDamage(twoSizes(), event(3), askingFlow([]));
    if (r.kind !== 'asked') throw new Error('expected a question');
    const d = r.decision;
    expect(d).toMatchObject({
      kind: 'chooseOption',
      seat: 1,
      purpose: 'replacement',
      options: ['shield:a', 'shield:b'],
    });
    expect(
      d.replacement.choices.map((c) => [c.option, c.outcome.amount, c.outcome.prevented]),
    ).toEqual([
      ['shield:a', 0, 3],
      ['shield:b', 0, 3],
    ]);
  });

  test('an answer is read once: the shield it names is applied first', () => {
    const flow = askingFlow(['shield:b']);
    const r = settleDamage(twoSizes(), event(3), flow);
    if (r.kind !== 'settled') throw new Error('expected it to settle');
    expect(flow.used).toBe(1);
    expect(r.remaining).toBe(0);
    expect(
      r.state.continuousEffects.map((e) => [e.id, (e.change as { amount: number }).amount]),
    ).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  test('a flow that never asks uses the default order where a question would come, and reads no answer', () => {
    const flow = quietFlow();
    const r = settleDamage(twoSizes(), event(3), flow);
    if (r.kind !== 'settled') throw new Error('expected it to settle');
    expect(flow.used).toBe(0);
    expect(r.state.continuousEffects.map((e) => e.id)).toEqual(['b']);
  });

  test('nothing is asked when the order cannot matter, even with a flow that asks', () => {
    const state = withShields(base, [
      { id: 'a', amount: 3 },
      { id: 'b', amount: 3 },
    ]);
    const flow = askingFlow([]);
    expect(settleDamage(state, event(2), flow).kind).toBe('settled');
    expect(flow.used).toBe(0);
  });
});

describe('a redirection among the effects (CR 614.9, 614.5, 616.1f, D-192)', () => {
  const TOISE = 'SYNTHETIC Ancient Adamantoise';
  const withToise = (toises = 1, extra: readonly string[] = []) => {
    const names = Array.from({ length: toises }, () => TOISE);
    return scenario()
      .seat(0)
      .battlefield('Sol Ring')
      .seat(1)
      .battlefield(...names, ...extra)
      .build();
  };
  const toPlayer = (amount: number): DamageEvent => ({
    source: 'o1',
    to: { kind: 'player', seat: 1 },
    amount,
    combat: false,
  });

  test('damage to the controller lists the redirection, after the shields, and the key names the creature and its ability', () => {
    const g = withToise();
    const toise = g.id(TOISE);
    const state = withShields(g.state, [{ id: 'a', amount: 3 }]);
    expect(keys(state, toPlayer(3))).toEqual(['shield:a', `redirect:${toise}:3`]);
  });

  test('damage to the opponent of the controller lists no redirection', () => {
    const g = withToise();
    expect(keys(g.state, { ...toPlayer(3), to: { kind: 'player', seat: 0 } })).toEqual([]);
  });

  test('a redirection already used for the event is not listed again (CR 614.5)', () => {
    const g = withToise();
    const toise = g.id(TOISE);
    const used = [`redirect:${toise}:3`];
    expect(damageModifiers(g.state, toPlayer(3), used)).toEqual([]);
  });

  test('damage to the creature itself is not redirected, and an event of 0 lists nothing', () => {
    const g = withToise();
    const toise = g.id(TOISE);
    const toTheCreature: DamageEvent = { ...toPlayer(3), to: { kind: 'object', id: toise } };
    expect(keys(g.state, toTheCreature)).toEqual([]);
    expect(keys(g.state, toPlayer(0))).toEqual([]);
  });

  test('a permanent that cannot be dealt damage (an artifact) is not a recipient of a redirection (CR 614.9)', () => {
    const g = withToise(1, ['Sol Ring']);
    const ring = g.id({ name: 'Sol Ring', seat: 1 });
    expect(keys(g.state, { ...toPlayer(3), to: { kind: 'object', id: ring } })).toEqual([]);
  });

  test('a redirection and a shield for 3 against 3 damage: asked, the redirection and a shield that prevents all: not asked', () => {
    const g = withToise();
    const numeric = withShields(g.state, [{ id: 'a', amount: 3 }]);
    expect(matters(numeric, toPlayer(3))).toBe(true);
    const all = withShields(g.state, [{ id: 'a', amount: 'all' }]);
    expect(matters(all, toPlayer(3))).toBe(false);
  });

  test('the redirection alone, or with a shield that does not apply to the damage, is not asked about', () => {
    const g = withToise();
    expect(matters(g.state, toPlayer(3))).toBe(false);
    const elsewhere = withShields(g.state, [{ id: 'a', amount: 3, players: [0] }]);
    expect(matters(elsewhere, toPlayer(3))).toBe(false);
  });

  test('default order, followed to its end: the shield first and then what is left goes to the creature', () => {
    const g = withToise();
    const toise = g.id(TOISE);
    const state = withShields(g.state, [{ id: 'a', amount: 2 }]);
    const r = settleDamage(state, toPlayer(3));
    expect(r.to).toEqual({ kind: 'object', id: toise });
    expect(r.remaining).toBe(1);
    expect(r.state.continuousEffects).toEqual([]);
    expect(r.events.map((e) => e.kind)).toEqual(['damagePrevented', 'damageRedirected']);
  });

  test('two creatures: asked which first; the creature applied last ends with the damage, and each redirection is used once (CR 614.5)', () => {
    const g = withToise(2);
    const [a, b] = g.find({ name: TOISE }).map((o) => o.id);
    if (a === undefined || b === undefined) throw new Error('two creatures');
    const flow = askingFlow([`redirect:${a}:3`]);
    const r = settleDamage(g.state, toPlayer(3), flow);
    if (r.kind !== 'settled') throw new Error('expected it to settle');
    expect(r.to).toEqual({ kind: 'object', id: b });
    expect(r.remaining).toBe(3);
    expect(r.events.map((e) => e.kind)).toEqual(['damageRedirected', 'damageRedirected']);
    const asked = settleDamage(g.state, toPlayer(3), askingFlow([]));
    expect(asked.kind).toBe('asked');
  });

  test('a flow that never asks takes the oldest creature first', () => {
    const g = withToise(2);
    const [a, b] = g.find({ name: TOISE }).map((o) => o.id);
    if (a === undefined || b === undefined) throw new Error('two creatures');
    const r = settleDamage(g.state, toPlayer(3));
    // a first, then b redirects the damage to a ("other permanents you control") and a has been used: it ends on b.
    expect(r.to).toEqual({ kind: 'object', id: b });
  });
});
