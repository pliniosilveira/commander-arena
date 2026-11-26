/**
 * "This artifact can't be sacrificed." (CR 701.21a, 101.2, 604.1; Hithlain Rope): the static ability `cantBeSacrificed` of a permanent. A permanent with it
 * can't be sacrificed: `sacrificePermanent` does nothing for it (CR 101.2: a "can't" effect makes the instruction do nothing), and it is no choice where a
 * player picks what to sacrifice (`sacrificeCandidates`), so a cost such as "Sacrifice an artifact" is not paid without a sacrifice.
 */
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';

/** Whether the permanent `id` has the ability `cantBeSacrificed` as `derive` has it now (a cheap check of its printed abilities comes first). */
export function cantBeSacrificed(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  if (obj === undefined) return false;
  // CR 701.21a, 101.2 (Call for Aid): "You can't sacrifice those creatures this turn": the player who made the effect, while they control the permanent (only its controller can sacrifice it).
  for (const e of state.continuousEffects) {
    if (
      e.change.kind === 'controllerCantSacrifice' &&
      e.objects.includes(id) &&
      controllerOf(state, obj) === e.change.seat
    ) {
      return true;
    }
  }
  if (!mayHaveStatic(state, obj, 'cantBeSacrificed')) return false;
  return derive(state, obj).abilities.some(
    (a) => a.kind === 'static' && a.static.kind === 'cantBeSacrificed',
  );
}
