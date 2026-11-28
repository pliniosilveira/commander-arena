/**
 * "Remove enchanted creature from combat" (CR 506.4, Observed Stasis): the `removeFromCombat` effect. Each creature the effect names that is on the battlefield is taken out of the
 * combat in progress by `removeFromCombat` of `rules/combat-removal.ts`, the one a change of controller and regeneration use. The set is fixed as the effect resolves (CR 611.2c).
 * The creatures really taken out of combat are recorded for "untap them" (`thisWay.removedFromCombat`, the `ObjectRef` `removedFromCombat`, CR 608.2c).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
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
  const removed: ObjectId[] = [];
  for (const id of resolveObjects(state, node.objects, ctx, targets)) {
    if (next.objects[id]?.zone !== 'battlefield') continue;
    const out = removeFromCombat(next, id);
    next = out.state;
    if (out.removed) removed.push(id);
  }
  // Left out when nothing was removed, so the state of every other resolution is what it was.
  return removed.length === 0
    ? done(next)
    : { ...done(next), thisWay: { removedFromCombat: removed } };
}
