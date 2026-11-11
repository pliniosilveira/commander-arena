// HeuristicAgent as an agent (M7c, SPEC 9, D-163): a handler for every decision kind, fallbacks, one reason
// per decision, the time budget with a fake clock, its mana and blocks, and the attack tax.
import { applyAction, DECISION_KINDS } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { CTX } from './helpers';
import { askHeuristic, ctxFor } from './heuristic-helpers';

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const RATS = 'Typhoid Rats';
const V3 = 'SYNTHETIC Vanilla 3/3';
const V5 = 'SYNTHETIC Vanilla 5/5';

describe('the agent contract', () => {
  test('a handler for every decision kind', () => {
    const view = scenario().seat(0).library('Island', { count: 4 }).build().view(0);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(Object.keys(agent.decisionHandlers(view)).sort()).toEqual([...DECISION_KINDS].sort());
  });

  test('a throwing handler falls back to a safe legal action and the fallback is recorded', async () => {
    const g = scenario().seat(0).battlefield('Forest').library('Island', { count: 4 }).build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const agent = new HeuristicAgent({
      seed: 1,
      handlerOverrides: {
        priority: () => {
          throw new Error('boom');
        },
      },
    });
    const action = await agent.decide(view, view.pending, CTX);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
    expect(agent.fallbacks).toEqual([{ decisionKind: 'priority', message: 'boom' }]);
  });

  test('every decision is recorded once, with a reason', async () => {
    const g = scenario().seat(0).battlefield('Forest').library('Island', { count: 4 }).build();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const agent = new HeuristicAgent({ seed: 1 });
    await agent.decide(view, view.pending, CTX);
    await agent.decide(view, view.pending, CTX);
    expect(agent.reasons).toHaveLength(2);
  });

  test('it answers without a sample in the context (a host that gives none)', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(V3)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const action = await askHeuristic(g, new HeuristicAgent({ seed: 1 }), { withSample: false });
    expect(action).toEqual({ kind: 'declareAttackers', attacks: [] });
  });

  test('the same seed gives the same answers', async () => {
    const run = async () => {
      const g = scenario()
        .seat(0)
        .battlefield(BEARS, SPIDER)
        .library('Island', { count: 4 })
        .seat(1)
        .battlefield(V3, RATS)
        .library('Island', { count: 4 })
        .at('precombatMain', { active: 0 })
        .build();
      g.advanceTo('declareAttackers', { attack: false });
      return JSON.stringify(await askHeuristic(g, new HeuristicAgent({ seed: 5 })));
    };
    expect(await run()).toBe(await run());
  });
});

/** A fake clock that moves `step` ms on every read, and how many times it was read. */
function fakeClock(step: number) {
  const clock = { reads: 0, t: 0 };
  return {
    clock,
    now: () => {
      clock.reads += 1;
      clock.t += step;
      return clock.t;
    },
  };
}

describe('the time budget', () => {
  /** Three attackers into four blockers at low life: many candidate plans. */
  function busyBlock(): ScenarioGame {
    const g = scenario()
      .seat(0)
      .life(9)
      .battlefield(SPIDER, V3, RATS, BEARS)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(V5, V3, BEARS)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack([V5, V3, BEARS]);
    g.advanceTo('declareBlockers', { block: false });
    return g;
  }

  test('a search stops at 60% of the budget and takes the best candidate so far', async () => {
    const generous = fakeClock(0);
    const full = await askHeuristic(busyBlock(), new HeuristicAgent({ seed: 1 }), {
      now: generous.now,
    });
    // Each read moves the clock 700 ms of a 1000 ms budget: the search is over at its first check, and a
    // play-out that is still running is dropped (HARD_SHARE), so the clock is read far less than without
    // a deadline.
    const hurried = fakeClock(700);
    const agent = new HeuristicAgent({ seed: 1 });
    const cut = await askHeuristic(busyBlock(), agent, { now: hurried.now });
    expect(cut.kind).toBe('declareBlockers');
    // Without a deadline more candidates are looked at, so the clock is read more often.
    expect(generous.clock.reads).toBeGreaterThan(hurried.clock.reads);
    expect(full.kind).toBe('declareBlockers');
    expect(agent.fallbacks).toHaveLength(0);
  });

  /** Four attackers into three blockers: more than five candidate attacks. */
  const attackBoard = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, SPIDER, V3, V5)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(BEARS, RATS, 'SYNTHETIC Vanilla 2/2')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('the same cut-off holds for an attack decision', async () => {
    const make = attackBoard;
    const generous = fakeClock(0);
    await askHeuristic(make(), new HeuristicAgent({ seed: 1 }), { now: generous.now });
    const hurried = fakeClock(700);
    const action = await askHeuristic(make(), new HeuristicAgent({ seed: 1 }), {
      now: hurried.now,
    });
    expect(action.kind).toBe('declareAttackers');
    expect(hurried.clock.reads).toBeLessThan(generous.clock.reads);
  });

  test('a play-out that runs past 70% of the budget is dropped and the rules-based plan answers (D-164)', async () => {
    // 450 ms per read of a 1000 ms budget: every candidate is dropped inside its play-out, so no
    // candidate is scored and the plan of the rules (the answer without a sample) is given, with no
    // fallback recorded: running out of time is not a failure.
    const slow = fakeClock(450);
    const agent = new HeuristicAgent({ seed: 1 });
    const answered = await askHeuristic(busyBlock(), agent, { now: slow.now });
    const rules = await askHeuristic(busyBlock(), new HeuristicAgent({ seed: 1 }), {
      withSample: false,
    });
    expect(answered).toEqual(rules);
    expect(agent.fallbacks).toHaveLength(0);
    // The play-outs asked the clock before their steps (the start, the checks of the search and one check
    // per step until the limit) and were dropped there, so far fewer reads than a play to the end.
    const full = fakeClock(0);
    await askHeuristic(busyBlock(), new HeuristicAgent({ seed: 1 }), { now: full.now });
    expect(slow.clock.reads).toBeGreaterThanOrEqual(5);
    expect(slow.clock.reads).toBeLessThan(full.clock.reads);
    // The same for an attack decision.
    const attack = await askHeuristic(attackBoard(), new HeuristicAgent({ seed: 1 }), {
      now: fakeClock(450).now,
    });
    const attackRules = await askHeuristic(attackBoard(), new HeuristicAgent({ seed: 1 }), {
      withSample: false,
    });
    expect(attack).toEqual(attackRules);
  });

  test('a decision with no sample and a clock that never moves takes no search at all', async () => {
    const g = busyBlock();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const clock = fakeClock(1);
    const agent = new HeuristicAgent({ seed: 1 });
    await agent.decide(view, view.pending, ctxFor(g, { now: clock.now, withSample: false }));
    expect(clock.clock.reads).toBe(1);
  });
});

describe('the one level (D-163, D-168)', () => {
  test('plays its mana by the best set, not the dearest spell', async () => {
    const g = scenario()
      .seat(0)
      .hand(SPIDER, V3, 'SYNTHETIC Vanilla 2/2')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .landsPlayed(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).toMatchObject({
      kind: 'castSpell',
      object: g.id(V3),
    });
  });

  test('always makes the good block, whatever its seed', async () => {
    const make = () => {
      const g = scenario()
        .seat(0)
        .battlefield(SPIDER)
        .library('Island', { count: 4 })
        .seat(1)
        .battlefield(BEARS)
        .library('Island', { count: 4 })
        .at('precombatMain', { active: 1 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(1).attack(BEARS);
      g.advanceTo('declareBlockers', { block: false });
      return g;
    };
    let blocks = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const n = await askHeuristic(make(), new HeuristicAgent({ seed }));
      if (n.kind === 'declareBlockers' && n.blocks.length > 0) blocks += 1;
    }
    expect(blocks).toBe(40);
  });
});

describe('the cost of attacking (CR 508.1h): the declaration is final', () => {
  const GATE = 'SYNTHETIC Tax Gate';

  function atAttackers(bears: number, lands: number) {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(
        ...Array.from({ length: bears }, () => BEARS),
        ...Array.from({ length: lands }, () => 'Mountain'),
      )
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(GATE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  test('it declares as many attackers as it can pay for, and the engine takes the payment', async () => {
    const g = atAttackers(3, 4);
    const action = await askHeuristic(g);
    expect(action.kind === 'declareAttackers' && action.attacks).toHaveLength(2);
    g.choose(action);
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const pay = await new HeuristicAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(pay).toEqual({ kind: 'payAuto' });
    expect(applyAction(g.state, 0, pay).ok).toBe(true);
  });

  test('with less mana than the tax of one creature it attacks with none', async () => {
    const g = atAttackers(3, 1);
    expect(await askHeuristic(g)).toEqual({ kind: 'declareAttackers', attacks: [] });
  });
});
