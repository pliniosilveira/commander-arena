/**
 * What changing a target starts from (CR 115.7a, D-181): the spell or ability whose target is changed and the instruction that changes it. Apart from
 * `rules/change-target.ts` so that the interpreter (`rules/effects.ts`) can make the instruction without importing the legality code that file needs
 * (the interpreter cannot import the mana engine, which runs effects), as `rules/copy-source.ts` does for copying a spell.
 */
import type { ObjectId } from '../ids';
import type { GameObject, GameState, Instruction } from '../state/types';

export type ChangeTargetInstruction = Extract<Instruction, { kind: 'changeTarget' }>;

/** Whether `obj` is a spell or ability on the stack that was put there with exactly one target (CR 115.9a). */
export function hasSingleTarget(obj: GameObject | undefined): obj is GameObject {
  return obj !== undefined && obj.zone === 'stack' && obj.stack?.chosenTargets.length === 1;
}

/** The instructions that change the target of each object of `ids` that is still a spell or ability on the stack with a single target (CR 608.2b). */
export function changeTargetInstructions(
  state: GameState,
  ids: readonly ObjectId[],
  to?: ObjectId,
): ChangeTargetInstruction[] {
  if (to !== undefined) {
    // "Change a target of ..." (CR 115.7b): a spell or ability on the stack with at least one target, changed to `to`.
    return ids.flatMap((id) => {
      const o = state.objects[id];
      return o?.zone === 'stack' && (o.stack?.chosenTargets.length ?? 0) > 0
        ? [{ kind: 'changeTarget' as const, object: id, to }]
        : [];
    });
  }
  return ids.flatMap((id) =>
    hasSingleTarget(state.objects[id]) ? [{ kind: 'changeTarget' as const, object: id }] : [],
  );
}
