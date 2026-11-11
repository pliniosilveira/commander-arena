// Every agent answers the question of the order of prevention effects on a damage event (CR 616.1, D-191, `chooseOption` with purpose
// 'replacement') with an option the engine lists and accepts, on real engine states built with the scenario DSL and the SYNTHETIC shields
// of the engine's `synthetic-damage-order.ts` (and the existing `synthetic-prevention.ts`). The casual and greedy agents take the first option
// (prevent first), the heuristic agent reads what each choice leads to and breaks ties toward the first, the random agent picks among the
// options; and games in which the question is asked, for spell damage and for combat damage, play on and end the same on replay.
import {
  type Action,
  applyAction,
  type ChooseOptionDecision,
  getLegalActions,
  stateHash,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { chooseReplacementByOutcome } from '../src/heuristic-replacement';
import {
  AGENT_FACTORIES,
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { CTX } from './helpers';

const SHIELD3 = 'SYNTHETIC Shield Three';
const SHIELD5 = 'SYNTHETIC Shield Five';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const BOLT = 'Lightning Bolt';

const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 1 (the agent) has a 3 shield and a 5 shield on itself; `then` plays on from there. */
function shielded(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Mountain', V33, V22)
    .hand(BOLT)
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains')
    .hand(SHIELD3, SHIELD5)
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
  for (const card of [SHIELD3, SHIELD5]) {
    if (g.state.pending?.kind === 'priority' && g.deciding !== 1 && g.state.stack.length === 0) {
      g.pass();
    }
    g.act(1).cast(`${card}[0]`, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
  }
  return g;
}

/** The question about Lightning Bolt dealt to seat 1. */
function boltQuestion(): ScenarioGame {
  const g = shielded();
  g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
  g.passAll();
  g.expect.pending('chooseOption', 1);
  return g;
}

/** The question about combat damage: both creatures attack seat 1, which has the two shields. */
function combatQuestion(): ScenarioGame {
  const g = shielded();
  g.advanceTo('declareAttackers');
  g.act(0).attack([V33, V22]);
  g.advanceTo('combatDamage');
  g.expect.pending('chooseOption', 1);
  return g;
}

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const view = g.view(1);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 1).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 1, action).ok).toBe(true);
}

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('no chooseOption decision');
  return d;
};

describe('the question is asked of the player who would take the damage, and is answered by every agent', () => {
  const agents: readonly [string, () => Agent][] = [
    ['casual', () => new CasualAgent({ seed: 3 })],
    ['greedy', () => new GreedyAgent({ seed: 3 })],
    ['heuristic', () => new HeuristicAgent({ seed: 3 })],
    ['random', () => new RandomLegalAgent({ seed: 3 })],
  ];

  test.each(agents)('%s: a legal answer for spell damage', async (_name, make) => {
    const g = boltQuestion();
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test.each(agents)('%s: a legal answer for combat damage', async (_name, make) => {
    const g = combatQuestion();
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test('the casual and greedy agents take the first option, the default order: prevent first', async () => {
    for (const make of [() => new CasualAgent({ seed: 3 }), () => new GreedyAgent({ seed: 3 })]) {
      const g = boltQuestion();
      const first = question(g).options[0];
      expect(await decide(g, make())).toEqual({ kind: 'chooseOption', option: first });
    }
  });

  test('the heuristic agent takes the first option when every choice leads to the same result', async () => {
    const g = boltQuestion();
    const d = question(g);
    // Both choices prevent all 3: the same outcome, so the tie goes to the first option.
    expect(new Set(d.replacement?.choices.map((c) => JSON.stringify(c.outcome))).size).toBe(1);
    expect(await decide(g, new HeuristicAgent({ seed: 3 }))).toEqual({
      kind: 'chooseOption',
      option: d.options[0],
    });
  });

  test('the random agent answers with an option, whichever the seed', async () => {
    const g = boltQuestion();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const a = await decide(g, new RandomLegalAgent({ seed }));
      expectLegal(g, a);
      if (a.kind === 'chooseOption') seen.add(a.option);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the heuristic agent chooses by what each choice leads to', () => {
  const decision = (
    choices: readonly { amount: number; prevented: number }[],
  ): ChooseOptionDecision => ({
    id: 'd1',
    kind: 'chooseOption',
    seat: 1,
    purpose: 'replacement',
    options: choices.map((_, i) => `shield:ce${i}`),
    source: 'o1',
    sourceName: 'Source',
    sourceOracleText: '',
    replacement: {
      event: {
        source: 'o1',
        sourceName: 'Source',
        to: { kind: 'player', seat: 1 },
        amount: 4,
        combat: false,
      },
      choices: choices.map((c, i) => ({
        option: `shield:ce${i}`,
        kind: 'prevent',
        text: `Prevent ${i}`,
        outcome: { to: { kind: 'player', seat: 1 }, ...c },
      })),
    },
  });

  test('the least damage that lands wins', () => {
    const d = decision([
      { amount: 2, prevented: 2 },
      { amount: 0, prevented: 4 },
      { amount: 1, prevented: 3 },
    ]);
    expect(chooseReplacementByOutcome(d)).toEqual({ kind: 'chooseOption', option: 'shield:ce1' });
  });

  test('with the same damage, the choice that prevents more wins, and a tie goes to the first', () => {
    expect(
      chooseReplacementByOutcome(
        decision([
          { amount: 1, prevented: 2 },
          { amount: 1, prevented: 3 },
        ]),
      ),
    ).toEqual({ kind: 'chooseOption', option: 'shield:ce1' });
    expect(
      chooseReplacementByOutcome(
        decision([
          { amount: 1, prevented: 3 },
          { amount: 1, prevented: 3 },
        ]),
      ),
    ).toEqual({ kind: 'chooseOption', option: 'shield:ce0' });
  });
});

describe('games in which the question is asked play on and replay', () => {
  test.each(['casual', 'greedy', 'heuristic', 'random'] as const)(
    '%s answers the combat question and the game goes on to the end of combat',
    async (kind) => {
      const g = combatQuestion();
      const agent = AGENT_FACTORIES[kind].create(5);
      const before = stateHash(g.state);
      // The first event asks; the second asks again when the order still matters (CR 616.1f): answer until the batch is dealt.
      let asked = 0;
      while (g.state.pending?.kind === 'chooseOption') {
        g.choose(1, await decide(g, agent));
        asked += 1;
        expect(asked).toBeLessThanOrEqual(2);
      }
      expect(stateHash(g.state)).not.toBe(before);
      // The damage of the step was all prevented (3 and 2 against shields of 3 and 5); the active player has priority.
      g.expect.life(1, 40);
      expect(g.deciding).toBe(0);
    },
  );

  test('the answers of an agent replay to the same state', async () => {
    const play = async () => {
      const g = boltQuestion();
      const agent = new HeuristicAgent({ seed: 9 });
      const a = await decide(g, agent);
      g.choose(1, a);
      return g;
    };
    const a = await play();
    const b = await play();
    expect(a.log).toEqual(b.log);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});

describe('a redirection among the choices (D-192): every agent answers, the heuristic agent reads where the damage ends', () => {
  const TOISE = 'SYNTHETIC Ancient Adamantoise';

  /** Seat 1 has the Adamantoise and a shield for 3 on itself; 3 damage from a bolt asks: prevent first, or deal it to the Adamantoise. */
  function redirectQuestion(): ScenarioGame {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(TOISE, 'Plains', 'Plains')
      .hand(SHIELD3)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast(`${SHIELD3}[0]`, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.pending('chooseOption', 1);
    return g;
  }

  const agents: readonly [string, () => Agent][] = [
    ['casual', () => new CasualAgent({ seed: 3 })],
    ['greedy', () => new GreedyAgent({ seed: 3 })],
    ['heuristic', () => new HeuristicAgent({ seed: 3 })],
    ['random', () => new RandomLegalAgent({ seed: 3 })],
  ];

  test.each(agents)('%s: a legal answer', async (_name, make) => {
    const g = redirectQuestion();
    expect(question(g).replacement?.choices.map((c) => c.kind)).toEqual(['prevent', 'redirect']);
    const a = await decide(g, make());
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });

  test('the casual and greedy agents take the first option: prevention before the redirection', async () => {
    for (const make of [() => new CasualAgent({ seed: 3 }), () => new GreedyAgent({ seed: 3 })]) {
      const g = redirectQuestion();
      expect(await decide(g, make())).toEqual({
        kind: 'chooseOption',
        option: question(g).options[0],
      });
    }
  });

  test('the heuristic agent prevents the damage rather than have it dealt to the Adamantoise', async () => {
    const g = redirectQuestion();
    expect(await decide(g, new HeuristicAgent({ seed: 3 }))).toEqual({
      kind: 'chooseOption',
      option: question(g).options[0],
    });
  });

  const choice = (
    option: string,
    to: { kind: 'player'; seat: number } | { kind: 'object'; id: string },
    amount: number,
    prevented: number,
  ) => ({
    option,
    kind: option.startsWith('redirect') ? ('redirect' as const) : ('prevent' as const),
    text: option,
    outcome: {
      to,
      ...(to.kind === 'object' ? { toName: 'Ancient Adamantoise' } : {}),
      amount,
      prevented,
    },
  });

  const decisionOf = (choices: ReturnType<typeof choice>[]): ChooseOptionDecision =>
    ({
      id: 'd1',
      kind: 'chooseOption',
      seat: 1,
      purpose: 'replacement',
      options: choices.map((c) => c.option),
      source: 'o1',
      sourceName: 'Source',
      sourceOracleText: '',
      replacement: {
        event: {
          source: 'o1',
          sourceName: 'Source',
          to: { kind: 'player', seat: 1 },
          amount: 3,
          combat: false,
        },
        choices,
      },
    }) as unknown as ChooseOptionDecision;

  test('a point of damage that lands on the agent costs more than a point that a redirection puts on a permanent', () => {
    const toise = { kind: 'object', id: 'o2' } as const;
    const you = { kind: 'player', seat: 1 } as const;
    // 2 to the player, or 3 to the Adamantoise: 2 against 1.5.
    expect(
      chooseReplacementByOutcome(
        decisionOf([choice('shield:ce1', you, 2, 1), choice('redirect:o2:3', toise, 3, 0)]),
      ),
    ).toEqual({ kind: 'chooseOption', option: 'redirect:o2:3' });
    // 1 to the player, or 3 to the Adamantoise: 1 against 1.5.
    expect(
      chooseReplacementByOutcome(
        decisionOf([choice('shield:ce1', you, 1, 2), choice('redirect:o2:3', toise, 3, 0)]),
      ),
    ).toEqual({ kind: 'chooseOption', option: 'shield:ce1' });
  });

  test('with nothing left to deal, either order is the same: the first option, prevention, wins the tie', () => {
    const toise = { kind: 'object', id: 'o2' } as const;
    const you = { kind: 'player', seat: 1 } as const;
    expect(
      chooseReplacementByOutcome(
        decisionOf([choice('shield:ce1', you, 0, 3), choice('redirect:o2:3', toise, 0, 3)]),
      ),
    ).toEqual({ kind: 'chooseOption', option: 'shield:ce1' });
  });
});
