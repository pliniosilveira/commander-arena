// CasualAgent and Vehicles (CR 301.7, 702.122): the heuristics of src/casual-vehicles.ts, run
// against real engine states built with the scenario DSL (SYNTHETIC cards), through the same
// handlers the agent uses in a game. Pins: it crews in its own precombat main phase, only to attack,
// only with spare creatures it would not attack with, only when the Vehicle has the higher power and
// is a safe attack; it answers the crew question with enough power; the random agent's answer is
// always accepted by the engine.
import { type Action, applyAction, type ChoosePermanentDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const WAGON = 'SYNTHETIC Rattle Wagon'; // Vehicle 4/4, Crew 3
const SKIFF = 'SYNTHETIC Scout Skiff'; // Vehicle 2/2 flying, Crew 1
const BEARS = 'Grizzly Bears'; // 2/2
const BIG = 'SYNTHETIC Vanilla 3/3';
const HUGE = 'SYNTHETIC Vanilla 5/5';

/** What the agent for the deciding seat answers to the pending decision. */
async function answerFor(g: ScenarioGame, agent = new CasualAgent({ seed: 1 })): Promise<Action> {
  const view = g.view(g.deciding);
  if (view.pending === null) throw new Error('no pending decision');
  return agent.decide(view, view.pending, CTX);
}

const crews = (a: Action, g: ScenarioGame, vehicle: string): boolean =>
  a.kind === 'activate' && a.object === g.id(vehicle);

function crewDecision(g: ScenarioGame): ChoosePermanentDecision {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d;
}

describe('when the agent crews', () => {
  test('a Vehicle with higher power than a spare (summoning-sick) creature that can pay for it', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BIG, { fresh: true })
      .seat(1)
      .build();
    const answer = await answerFor(g);
    expect(answer).toEqual({ kind: 'activate', object: g.id(WAGON), abilityIndex: 1 });
  });

  test('two spare creatures together pay a crew cost neither pays alone', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { fresh: true, count: 2 })
      .seat(1)
      .build();
    expect(crews(await answerFor(g), g, WAGON)).toBe(true);
  });

  test('a creature that would not be a safe attack is spare too', async () => {
    // The opposing 3/3 kills a 2/2 blocker-wise, so the agent keeps both Bears home; the 4/4
    // Vehicle survives a 3/3 and kills it, so it is a safe attack.
    const g = scenario().seat(0).battlefield(WAGON, BEARS, BEARS).seat(1).battlefield(BIG).build();
    expect(crews(await answerFor(g), g, WAGON)).toBe(true);
  });

  test('then the crewed Vehicle is a candidate attacker and the agent attacks with it', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BIG, { fresh: true })
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    const mine = new CasualAgent({ seed: 1 });
    const theirs = new CasualAgent({ seed: 2 });
    for (let i = 0; i < 12 && g.state.pending?.kind !== 'declareAttackers'; i += 1) {
      g.choose(await answerFor(g, g.deciding === 0 ? mine : theirs));
    }
    g.expect.pending('declareAttackers', 0);
    g.expect.derived(WAGON, { types: ['artifact', 'creature'] });
    g.expect.tapped(BIG);
    const attack = await answerFor(g, mine);
    expect(attack).toMatchObject({
      kind: 'declareAttackers',
      attacks: [{ attacker: g.id(WAGON) }],
    });
  });
});

describe('when the agent does not crew', () => {
  const idle = async (g: ScenarioGame) => {
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  };

  test('with no spare creature: one it would attack with anyway stays untapped', async () => {
    await idle(scenario().seat(0).battlefield(WAGON, BIG).seat(1).build());
  });

  test('with spare creatures that cannot pay: one 2/2 for Crew 3', async () => {
    await idle(
      scenario().seat(0).battlefield(WAGON).battlefield(BEARS, { fresh: true }).seat(1).build(),
    );
  });

  test('when the spare creature has as much power as the Vehicle', async () => {
    await idle(
      scenario().seat(0).battlefield(WAGON).battlefield(HUGE, { fresh: true }).seat(1).build(),
    );
  });

  test('when the Vehicle arrived this turn: it could not attack (CR 302.6)', async () => {
    await idle(
      scenario()
        .seat(0)
        .battlefield(WAGON, { fresh: true })
        .battlefield(BIG, { fresh: true })
        .seat(1)
        .build(),
    );
  });

  test('when the Vehicle would not be a safe attack', async () => {
    await idle(
      scenario()
        .seat(0)
        .battlefield(WAGON)
        .battlefield(BIG, { fresh: true })
        .seat(1)
        .battlefield(HUGE)
        .build(),
    );
  });

  test('when the Vehicle is tapped', async () => {
    await idle(
      scenario()
        .seat(0)
        .battlefield(WAGON, { tapped: true })
        .battlefield(BIG, { fresh: true })
        .seat(1)
        .build(),
    );
  });

  test('never to block: not on the opponent turn', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BIG, { fresh: true })
      .seat(1)
      .battlefield(HUGE)
      .at('precombatMain', { active: 1, priority: 0 })
      .build();
    await idle(g);
  });

  test('not after the main phase of its own turn', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BIG, { fresh: true })
      .seat(1)
      .at('beginningOfCombat', { active: 0, priority: 0 })
      .build();
    await idle(g);
  });

  test('once per window: after crewing it does not crew again in the same step', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON, SKIFF)
      .battlefield(BEARS, { fresh: true, count: 3 })
      .seat(1)
      .build();
    const agent = new CasualAgent({ seed: 1 });
    const first = await answerFor(g, agent);
    expect(first.kind).toBe('activate');
    g.choose(first);
    // The crew question is answered, then priority returns with the ability on the stack: pass.
    g.choose(await answerFor(g, agent));
    expect(await answerFor(g, agent)).toEqual({ kind: 'pass' });
  });
});

describe('answering the crew question', () => {
  test('the fewest spare creatures that pay, and enough power', async () => {
    // Crew 1 on a 2/2 Vehicle: three summoning-sick 1/1s are spare, and one is plenty.
    const g = scenario()
      .seat(0)
      .battlefield(SKIFF)
      .battlefield('SYNTHETIC Vanilla 1/1', { fresh: true, count: 3 })
      .seat(1)
      .build();
    g.choose(await answerFor(g));
    const d = crewDecision(g);
    expect(d.minTotalPower).toBe(1);
    const answer = await answerFor(g);
    expect(answer).toMatchObject({ kind: 'choosePermanents' });
    if (answer.kind !== 'choosePermanents') return;
    expect(answer.objects).toHaveLength(1);
    expect(applyAction(g.state, 0, answer).ok).toBe(true);
  });

  test('two small creatures together when one is not enough', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WAGON)
      .battlefield(BEARS, { fresh: true, count: 2 })
      .seat(1)
      .build();
    g.choose(await answerFor(g));
    const answer = await answerFor(g);
    if (answer.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
    expect(answer.objects).toHaveLength(2);
    expect(applyAction(g.state, 0, answer).ok).toBe(true);
  });

  test('a crew question the agent did not plan is still answered with enough power', async () => {
    // A human-started crew cannot happen to the agent, but the handler must never answer too low:
    // here every creature is one it would attack with, and it taps the least valuable ones.
    const g = scenario().seat(0).battlefield(WAGON, BIG, BEARS, BEARS).seat(1).build();
    g.act(0).activate(WAGON);
    const d = crewDecision(g);
    const answer = await answerFor(g);
    if (answer.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
    const power = answer.objects.reduce((sum, id) => sum + (d.powers?.[id] ?? 0), 0);
    expect(power).toBeGreaterThanOrEqual(3);
    expect(applyAction(g.state, 0, answer).ok).toBe(true);
  });
});

describe('the random agent answers a crew question with a subset the engine accepts', () => {
  test('for many seeds, with creatures of different power', async () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const g = scenario()
        .seat(0)
        .battlefield(WAGON)
        .battlefield(BEARS, { count: 2 })
        .battlefield(BIG, HUGE, 'SYNTHETIC Vanilla 1/1')
        .seat(1)
        .build();
      g.act(0).activate(WAGON);
      const d = crewDecision(g);
      const agent = new RandomLegalAgent({ seed });
      const answer = await agent.decide(g.view(0), d, CTX);
      expect(answer.kind, `seed ${seed}`).toBe('choosePermanents');
      const r = applyAction(g.state, 0, answer);
      expect(r.ok, `seed ${seed}: ${r.ok ? '' : r.error}`).toBe(true);
      expect(agent.fallbacks).toHaveLength(0);
    }
  });
});
