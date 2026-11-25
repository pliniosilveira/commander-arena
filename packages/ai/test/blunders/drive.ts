// Shared drivers of the blunder suite: let the HeuristicAgent answer every decision of its seat until
// it passes priority, and read what it did.
import type { Action } from '@commander-arena/engine';
import type { ScenarioGame } from '@commander-arena/engine/testing';
import { findObject } from '../../src/casual-view';
import { HeuristicAgent } from '../../src/index';
import { askHeuristic } from '../heuristic-helpers';

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
  agent: HeuristicAgent = new HeuristicAgent({ seed: 1 }),
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
