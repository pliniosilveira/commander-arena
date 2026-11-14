// The decisions of M5 as the engine's API presents them: what getLegalActions lists, what
// applyAction accepts and rejects, and that the whole thing is deterministic (SPEC test 29).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type ChoosePermanentDecision,
  getLegalActions,
  legalActionsForDecision,
  type ObjectId,
  stateHash,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

/** A choosePermanent decision with three candidates (the Dragon's enters trigger). */
function atChoice(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand('SYNTHETIC Sacrifice Dragon')
    .pool('CCCB')
    .battlefield('Forest', 'Plains', 'Grizzly Bears')
    .library(...FILLER)
    .seat(1)
    .build();
  g.act(0).cast('SYNTHETIC Sacrifice Dragon', { pay: true });
  g.passAll();
  g.expect.pending('choosePermanent', 0);
  return g;
}

/** An orderTriggers decision with three different triggers waiting. */
function atOrdering(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand('SYNTHETIC Wrath')
    .battlefield('Plains', 'Plains', 'Plains', 'Plains')
    .battlefield('SYNTHETIC Mourner', 'SYNTHETIC Dies Treasure Creature', 'SYNTHETIC Spite Watcher')
    .seat(1)
    .battlefield('Grizzly Bears')
    .build();
  g.act(0).cast('SYNTHETIC Wrath', { pay: true });
  g.pass();
  g.pass();
  g.expect.pending('orderTriggers', 0);
  return g;
}

const accepted = (g: ScenarioGame, seat: number, action: Action) =>
  applyAction(g.state, seat, action).ok;

describe('choosePermanent', () => {
  test('lists every legal single choice, and the engine accepts each', () => {
    const g = atChoice();
    const d = g.state.pending as ChoosePermanentDecision;
    const listed = getLegalActions(g.state, 0);
    const choices = listed.filter((a) => a.kind === 'choosePermanents');
    expect(choices).toHaveLength(d.legal.length);
    for (const a of choices) expect(accepted(g, 0, a), JSON.stringify(a)).toBe(true);
    expect(listed.some((a) => a.kind === 'concede')).toBe(true);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('only the deciding seat answers, and only with the matching action', () => {
    const g = atChoice();
    const forest = g.id('Forest');
    expect(accepted(g, 1, { kind: 'choosePermanents', objects: [forest] })).toBe(false);
    for (const wrong of [
      { kind: 'pass' },
      { kind: 'cancel' },
      { kind: 'chooseCards', objects: [forest] },
      { kind: 'acceptOptional' },
      { kind: 'orderTriggers', order: [0] },
    ] as Action[]) {
      expect(accepted(g, 0, wrong), wrong.kind).toBe(false);
    }
  });

  test('conceding is always allowed', () => {
    const g = atChoice();
    const r = applyAction(g.state, 0, { kind: 'concede' });
    expect(r.ok && r.state.result).toEqual({ kind: 'win', winner: 1 });
  });

  test('a choice among dozens of permanents lists a bounded number of answers', () => {
    const many = Array.from({ length: 40 }, (_, i) => `o${i + 100}` as ObjectId);
    const actions = legalActionsForDecision({
      kind: 'choosePermanent',
      id: 'd1',
      seat: 0,
      source: 'o1',
      purpose: 'sacrifice',
      min: 3,
      max: 3,
      legal: many,
    });
    expect(actions.length).toBeGreaterThan(1);
    expect(actions.length).toBeLessThanOrEqual(501);
    for (const a of actions) {
      if (a.kind === 'choosePermanents') {
        expect(a.objects).toHaveLength(3);
        expect(new Set(a.objects).size).toBe(3);
      }
    }
  });
});

describe('orderTriggers', () => {
  test('lists every permutation of the triggers, and the engine accepts each', () => {
    const g = atOrdering();
    const orders = getLegalActions(g.state, 0).filter((a) => a.kind === 'orderTriggers');
    // Mourner (twice for the two other creatures that die), the Treasure creature, and nothing
    // else for seat 0: Spite Watcher triggers for the opponent's Bears: three groups, six orders.
    expect(orders).toHaveLength(6);
    for (const a of orders) expect(accepted(g, 0, a), JSON.stringify(a)).toBe(true);
  });

  test('more than five trigger groups are listed with two orders only (identity and reverse)', () => {
    const actions = legalActionsForDecision({
      kind: 'orderTriggers',
      id: 'd1',
      seat: 0,
      triggers: Array.from({ length: 7 }, (_, i) => ({
        source: `o${i}` as ObjectId,
        sourceName: `T${i}`,
        sourceOracleText: '',
        abilityIndex: 0,
        count: 1,
      })),
    });
    const orders = actions.filter((a) => a.kind === 'orderTriggers');
    expect(orders).toHaveLength(2);
  });

  test('an answer that is not a permutation is rejected and nothing changes', () => {
    const g = atOrdering();
    const before = stateHash(g.state);
    for (const order of [[], [0], [0, 1], [0, 1, 1], [0, 1, 3], [-1, 0, 1], [0.5, 1, 2]]) {
      expect(accepted(g, 0, { kind: 'orderTriggers', order }), JSON.stringify(order)).toBe(false);
    }
    expect(stateHash(g.state)).toBe(before);
  });

  test('the opponent cannot order my triggers', () => {
    const g = atOrdering();
    expect(accepted(g, 1, { kind: 'orderTriggers', order: [0, 1, 2] })).toBe(false);
  });
});

describe('confirmOptional', () => {
  const atMay = () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC May Draw Creature')
      .pool('CCU')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC May Draw Creature', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    return g;
  };

  test('lists accept and decline, and names the source', () => {
    const g = atMay();
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).toEqual(['acceptOptional', 'declineOptional', 'concede']);
    const d = g.state.pending;
    expect(d?.kind === 'confirmOptional' && d.sourceName).toBe('SYNTHETIC May Draw Creature');
    expect(d?.kind === 'confirmOptional' && d.sourceOracleText).toContain('you may draw a card');
  });

  test('other actions are rejected', () => {
    const g = atMay();
    for (const wrong of [{ kind: 'pass' }, { kind: 'choosePermanents', objects: [] }] as Action[]) {
      expect(accepted(g, 0, wrong), wrong.kind).toBe(false);
    }
    expect(accepted(g, 1, { kind: 'acceptOptional' })).toBe(false);
  });
});

describe('determinism (SPEC test 29)', () => {
  test('the same scenario and the same answers give the same state hash', () => {
    const play = () => {
      const g = atOrdering();
      g.act(0).orderTriggers(2, 1, 0);
      g.passAll();
      return g.hash();
    };
    expect(play()).toBe(play());
    expect(play()).not.toBe(atOrdering().hash());
  });

  test('ordering differently leads to different stacks but the same total result', () => {
    const run = (order: number[]) => {
      const g = atOrdering();
      g.act(0).orderTriggers(...order);
      g.passAll();
      return g.state.seats.map((s) => s.life);
    };
    expect(run([0, 1, 2])).toEqual(run([2, 1, 0]));
  });
});
