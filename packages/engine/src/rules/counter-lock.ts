/**
 * "Stun counters can't be removed from permanents your opponents control." (Fear of Sleep Paralysis; CR 122.1, 122.1d, 701.26b): the `cantRemoveCounters` static ability, read from the
 * derived abilities of the battlefield permanents (CR 604.1, so a permanent that lost its abilities locks nothing). While it applies, no counter of its kind comes off a permanent its
 * `permanents` filter describes, whatever takes it: the stun counter that would be removed instead of untapping stays and so does the permanent's tapped status (`rules/untap.ts`), an
 * effect that removes or moves counters leaves it, and a tapped permanent with the counter can't be untapped to pay a cost (CR 701.26b: it could not be untapped).
 */
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

/** Whether a counter of the kind `counter` can't be removed from `obj` now (CR 122.1d): it has one, and a permanent on the battlefield says so. */
export function counterRemovalLocked(state: GameState, obj: GameObject, counter: string): boolean {
  if (obj.zone !== 'battlefield' || (obj.counters[counter] ?? 0) <= 0) return false;
  for (const id of state.battlefield) {
    const holder = state.objects[id];
    if (holder === undefined) continue;
    for (const a of derive(state, holder).abilities) {
      if (a.kind !== 'static' || a.static.kind !== 'cantRemoveCounters') continue;
      if (a.static.counter !== counter) continue;
      const ctx = { controller: controllerOf(state, holder), source: id };
      if (a.condition !== undefined && !evaluateCondition(state, a.condition, ctx)) continue;
      if (matchesFilter(state, obj, { ...a.static.permanents, zone: 'battlefield' }, ctx)) {
        return true;
      }
    }
  }
  return false;
}

/** The permanent `id`, by id: whether a counter of the kind can't be removed from it. */
export function counterRemovalLockedById(state: GameState, id: ObjectId, counter: string): boolean {
  const obj = state.objects[id];
  return obj !== undefined && counterRemovalLocked(state, obj, counter);
}
