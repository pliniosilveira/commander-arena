// Helpers of the CasualAgent tests (`casual-*.test.ts`), on states built with the scenario DSL.
import {
  type Action,
  applyAction,
  getLegalActions,
  type PendingDecision,
} from '@commander-arena/engine';
import type { ScenarioGame } from '@commander-arena/engine/testing';
import { expect } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

/** What the agent answers to the decision that is pending, as the deciding seat sees it. */
export async function answer(
  g: ScenarioGame,
  agent: { decide: CasualAgent['decide'] } = new CasualAgent({ seed: 1 }),
): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

/** What the agent answers to a priority decision. */
export async function answerFor(
  g: ScenarioGame,
  agent = new CasualAgent({ seed: 1 }),
): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  const decision = view.pending;
  if (decision?.kind !== 'priority') throw new Error('expected a priority decision');
  return agent.decide(view, decision, CTX);
}

export const sameAction = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

/** The answer is among the actions the engine lists for the seat, and the engine accepts it. */
export function expectLegal(g: ScenarioGame, action: Action) {
  const d = g.state.pending as PendingDecision;
  expect(getLegalActions(g.state, d.seat).some((a) => sameAction(a, action))).toBe(true);
  expect(applyAction(g.state, d.seat, action).ok).toBe(true);
}
