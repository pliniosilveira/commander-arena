/**
 * Helpers for the HeuristicAgent tests: a decision context that hands out a determinized sample of a
 * scenario's real state (like `runGame` does), a fake clock, and a card with ad hoc keywords.
 */
import {
  type Action,
  applyAction,
  type CardDefinition,
  createRng,
  determinize,
  type Keyword,
  type SeatId,
} from '@commander-arena/engine';
import type { ScenarioGame } from '@commander-arena/engine/testing';
import { expect } from 'vitest';
import type { DecideContext } from '../src/index';
import { HeuristicAgent } from '../src/index';

/** The context the runner would build for the seat now deciding in `g`. */
export function ctxFor(
  g: ScenarioGame,
  options: { now?: () => number; budgetMs?: number; withSample?: boolean } = {},
): DecideContext {
  const state = g.state;
  const seat = state.pending?.seat as SeatId;
  return {
    budgetMs: options.budgetMs ?? 1000,
    now: options.now ?? (() => 0),
    ...(options.withSample === false
      ? {}
      : { sample: (seed: number) => determinize(state, seat, createRng(seed)) }),
  };
}

/** Asks the heuristic agent for the pending decision of `g`; checks that the engine accepts the answer. */
export async function askHeuristic(
  g: ScenarioGame,
  agent: HeuristicAgent = new HeuristicAgent({ seed: 1 }),
  options: Parameters<typeof ctxFor>[1] = {},
): Promise<Action> {
  const seat = g.deciding;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('no decision');
  const action = await agent.decide(view, view.pending, ctxFor(g, options));
  expect(applyAction(g.state, seat, action).ok).toBe(true);
  return action;
}

export const lastReason = (agent: HeuristicAgent) => agent.reasons[agent.reasons.length - 1];

/** A creature with the given keywords, power and toughness: a SYNTHETIC test card. */
export function creature(
  name: string,
  power: number,
  toughness: number,
  keywords: readonly Keyword['kind'][] = [],
  options: { cost?: string[]; commander?: boolean } = {},
): CardDefinition {
  return {
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: options.cost ?? ['2'],
        supertypes: [],
        types: ['creature'],
        subtypes: ['Construct'],
        colors: [],
        power,
        toughness,
        loyalty: null,
        defense: null,
        oracleText: keywords.join(', '),
        abilities: keywords.map((kind) => ({ kind: 'keyword', keyword: { kind } as Keyword })),
        spell: null,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  };
}
