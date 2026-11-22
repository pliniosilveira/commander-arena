/**
 * "Remove enchanted creature from combat" (CR 506.4, Observed Stasis): the `removeFromCombat` effect. Each creature the effect names that is on the battlefield is taken out of the
 * combat in progress by `removeFromCombat` of `rules/combat-removal.ts`, the one a change of controller and regeneration use. The set is fixed as the effect resolves (CR 611.2c).
 */
import type { Effect } from '../ast/types';
import type { ChosenTarget, GameState } from '../state/types';
import { removeFromCombat } from './combat-removal';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

export function runRemoveFromCombat(
  state: GameState,
  node: Extract<Effect, { kind: 'removeFromCombat' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  for (const id of resolveObjects(state, node.objects, ctx, targets)) {
    if (next.objects[id]?.zone !== 'battlefield') continue;
    next = removeFromCombat(next, id).state;
  }
  return done(next);
}
