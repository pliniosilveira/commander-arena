// Shared drivers of the blunder suite: let the HeuristicAgent answer every decision of its seat until
// it passes priority, and read what it did.
import { readFileSync } from 'node:fs';
import type { Action } from '@commander-arena/engine';
import type { ScenarioGame } from '@commander-arena/engine/testing';
import { findObject } from '../../src/casual-view';
import {
  type AgentWeights,
  HeuristicAgent,
  type PartialWeights,
  withWeights,
} from '../../src/index';
import { askHeuristic } from '../heuristic-helpers';

/**
 * The weights the suite plays with: the defaults, or a partial AgentWeights read from the JSON file that the
 * environment variable AI_WEIGHTS names (`AI_WEIGHTS=tuned.json pnpm test:focus -- packages/ai/test/blunders`),
 * so a tuned file (tools/ai/tune.ts) can be checked against the suite. Only the tests read it, never src.
 */
const WEIGHTS: AgentWeights | undefined = process.env.AI_WEIGHTS
  ? withWeights(JSON.parse(readFileSync(process.env.AI_WEIGHTS, 'utf8')) as PartialWeights)
  : undefined;

/** The agent of the blunder suite, with the suite's weights. */
export const blunderAgent = (seed = 1): HeuristicAgent =>
  new HeuristicAgent(WEIGHTS === undefined ? { seed } : { seed, weights: WEIGHTS });

/** What the agent did with one stretch of priority: its answers, and the names of the spells it cast. */
export interface Played {
  readonly actions: readonly Action[];
  readonly cast: readonly string[];
}

/**
 * The agent answers each decision of `seat` (casts, targets, payments) until it passes priority, the
 * decision moves to another seat, or `limit` answers were given. A spell's name is read as it is cast:
 * its object id changes when it moves to the stack.
 */
export async function playUntilPass(
  g: ScenarioGame,
  seat: 0 | 1,
  agent: HeuristicAgent = blunderAgent(),
  limit = 20,
): Promise<Played> {
  const actions: Action[] = [];
  const cast: string[] = [];
  for (let i = 0; i < limit && g.state.pending !== null && g.deciding === seat; i += 1) {
    const action = await askHeuristic(g, agent);
    actions.push(action);
    if (action.kind === 'pass' && g.state.stack.length === 0) break;
    if (action.kind === 'castSpell') cast.push(nameOf(g, action.object));
    g.choose(action);
    // A pass with something on the stack: the other seat passes too, and the top object resolves.
    if (action.kind === 'pass') {
      while (g.state.pending !== null && g.deciding !== seat) g.pass();
    }
  }
  return { actions, cast };
}

/** Whether an answer activates an ability of a permanent that is not a mana ability (CR 602.2). */
export const isActivation = (a: Action): boolean => a.kind === 'activate';

/** The name of an object as seat 0 sees it ('?' when it cannot see it). */
export const nameOf = (g: ScenarioGame, id: string): string =>
  findObject(g.view(0), id)?.name ?? '?';
