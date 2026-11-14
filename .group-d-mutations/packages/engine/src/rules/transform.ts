/**
 * Transform (CR 701.27): a double-faced permanent is turned over so its other face is up. It is
 * the same object afterwards (CR 712.18): `GameObject.face` is all that changes, so counters,
 * attachments, damage, tapped status, continuous effects and the controller stay as they were, and
 * `derive` reads the new face's characteristics and abilities (layer 1, `rules/copiable.ts`).
 * A permanent that leaves the battlefield is a new object with its front face up (CR 712.8a, 400.7).
 */
import type { Effect } from '../ast/types';
import { allocateTimestamp, definitionOf, patchObject } from '../state/ops';
import type { ChosenTarget, GameState, ResolutionContext } from '../state/types';
import { transformedFace } from './layouts';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** Runs a `transform` effect for the permanents its selector names right now. */
export function runTransform(
  state: GameState,
  res: ResolutionContext,
  node: Extract<Effect, { kind: 'transform' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  let next = state;
  // CR 701.27f: this is an ability that was put on the stack at the time its object was created.
  const ability = state.objects[res.object];
  const abilityStamp = ability?.stack?.kind === 'ability' ? ability.timestamp : null;
  for (const id of resolveObjects(state, node.objects, ctx, targets)) {
    const obj = next.objects[id];
    // A token is not a double-faced card (CR 712.9); a card on any other zone is not a permanent.
    if (obj?.zone !== 'battlefield' || obj.card === null) continue;
    const face = transformedFace(definitionOf(next, obj.card), obj.face);
    if (face === null) continue; // CR 712.9, 712.10: nothing happens
    // CR 701.27f: an ability of the permanent that tries to transform it does so only if it has not
    // transformed since the ability was put on the stack.
    if (
      abilityStamp !== null &&
      res.source === id &&
      obj.transformedAt !== undefined &&
      obj.transformedAt > abilityStamp
    ) {
      continue;
    }
    const [stamp, stamped] = allocateTimestamp(next);
    next = patchObject(stamped, id, { face, transformedAt: stamp });
  }
  return done(next);
}
