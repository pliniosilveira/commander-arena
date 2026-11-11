// The mana and lands slice from the AI side: the shock land's "pay 2 life?" decision (a
// confirmOptional with a cost), and whole games on the SYNTHETIC mana lands (dual, pain, check and
// shock lands, Signets, a hat with no maximum hand size) with both agents.
// All cards are SYNTHETIC (engine src/cards/fixtures/synthetic-mana.ts). CR 614.12 (the question
// is asked as the land enters), CR 119.4 (life is paid only if the life total allows it).
import {
  type ConfirmOptionalDecision,
  checkInvariants,
  createRng,
  nextInt,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { createRandomHandlers } from '../src/random-agent';
import { CTX, smallGameConfig, stepGame } from './helpers';

const SHOCK = 'SYNTHETIC Shock Land';

function shockQuestion(life: number) {
  const g = scenario().seat(0).life(life).hand(SHOCK).seat(1).build();
  g.act(0).playLand(SHOCK);
  const d = g.state.pending;
  if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
  return { g, d, view: g.view(0) };
}

describe('the shock land question', () => {
  test('CasualAgent pays while its life is above the threshold, and declines at or below it', async () => {
    for (const [life, kind] of [
      [40, 'acceptOptional'],
      [PAY_LIFE_ABOVE + 1, 'acceptOptional'],
      [PAY_LIFE_ABOVE, 'declineOptional'],
      [3, 'declineOptional'],
    ] as const) {
      const { g, d, view } = shockQuestion(life);
      const action = await new CasualAgent({ seed: 1 }).decide(view, d, CTX);
      expect(action, `life ${life}`).toEqual({ kind });
      // The engine accepts the answer, and it does what it says.
      expect(g.act(0).try.action(action).ok).toBe(true);
      g.expect.tapped(SHOCK, kind === 'declineOptional');
      g.expect.life(0, kind === 'acceptOptional' ? life - 2 : life);
    }
  });

  test('CasualAgent never answers a cost it cannot weigh with a payment', async () => {
    const { d, view } = shockQuestion(40);
    const odd: ConfirmOptionalDecision = { ...d, cost: [{ kind: 'discard', count: 1 }] };
    expect(await new CasualAgent({ seed: 1 }).decide(view, odd, CTX)).toEqual({
      kind: 'declineOptional',
    });
  });

  test('RandomLegalAgent answers with one of the two legal answers, and both come up', async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const { g, d, view } = shockQuestion(40);
      const action = await new RandomLegalAgent({ seed }).decide(view, d, CTX);
      expect(['acceptOptional', 'declineOptional']).toContain(action.kind);
      expect(g.act(0).try.action(action).ok).toBe(true);
      seen.add(action.kind);
    }
    expect(seen).toEqual(new Set(['acceptOptional', 'declineOptional']));
  });

  test('the random handlers use the same decision as the engine lists', () => {
    let rng = createRng(3);
    const draw = (n: number) => {
      const [v, next] = nextInt(rng, n);
      rng = next;
      return v;
    };
    const { d } = shockQuestion(40);
    const handlers = createRandomHandlers(draw);
    expect(['acceptOptional', 'declineOptional']).toContain(handlers.confirmOptional(d).kind);
  });
});

describe('whole games on the mana lands', () => {
  const LIMITS = { maxTurns: 150, maxActions: 5000 };
  const GAMES = 30;

  test(`${GAMES} games each of random vs random and casual vs casual: no rejection, sound states, and the shock questions are asked and answered`, async () => {
    let questions = 0;
    let payments = 0;
    let manualTaps = 0;
    for (const kinds of ['random', 'casual'] as const) {
      for (let g = 1; g <= GAMES; g += 1) {
        const config = smallGameConfig(g, ['mana', 'mana']);
        const make = (seed: number) =>
          kinds === 'casual' ? new CasualAgent({ seed }) : new RandomLegalAgent({ seed });
        const agents = [make(7000 + 2 * g), make(7001 + 2 * g)] as const;
        const result = await stepGame(config, agents, LIMITS, (step) => {
          const d = step.before.pending;
          if (d?.kind === 'confirmOptional' && d.cost !== undefined) {
            questions += 1;
            if (step.action.kind === 'acceptOptional') payments += 1;
          }
          if (step.action.kind === 'activateAbility') manualTaps += 1;
          expect(checkInvariants(step.after), `${kinds} game ${g} step ${step.index}`).toEqual([]);
        });
        expect(result.capped, `${kinds} game ${g}`).toBe(false);
        for (const agent of agents) expect(agent.fallbacks, `${kinds} game ${g}`).toHaveLength(0);
      }
    }
    console.log(
      `mana games: ${questions} shock questions, ${payments} paid, ${manualTaps} hand taps`,
    );
    expect(questions).toBeGreaterThan(0);
    expect(payments).toBeGreaterThan(0);
  }, 120_000);
});
