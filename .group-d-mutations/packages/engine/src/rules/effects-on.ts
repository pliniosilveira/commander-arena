/**
 * The continuous effects of the game state grouped by the object they affect (CR 613.7), in timestamp order. A leaf of the rules, so that
 * `control.ts` (who controls a permanent, layer 2) can read it without importing the layers that come after it.
 */
import type { ObjectId } from '../ids';
import type { ContinuousEffect, GameState } from '../state/types';

const NONE: readonly ContinuousEffect[] = [];

/**
 * The effects of one list of continuous effects grouped by the object they affect, each group in timestamp order. The list is a
 * value of the game state that most changes leave as it is (it grows when an effect begins and shrinks when one ends), so the grouping
 * is made once for each list, by its identity, and shared by every state that has it; the entries are what `effectsOn` would have
 * found by filtering the list.
 */
const effectGroups = new WeakMap<
  readonly ContinuousEffect[],
  ReadonlyMap<ObjectId, readonly ContinuousEffect[]>
>();

function groupEffects(
  effects: readonly ContinuousEffect[],
): ReadonlyMap<ObjectId, readonly ContinuousEffect[]> {
  let groups = effectGroups.get(effects);
  if (groups === undefined) {
    const lists = new Map<ObjectId, ContinuousEffect[]>();
    for (const e of effects) {
      // An effect that names an object twice still affects it once (`includes`).
      for (const id of new Set(e.objects)) {
        const list = lists.get(id);
        if (list === undefined) lists.set(id, [e]);
        else list.push(e);
      }
    }
    // The list is appended to as effects are created, which is timestamp order; sorting keeps that
    // true for any state that was built another way.
    for (const [id, list] of lists) {
      if (list.length >= 2)
        lists.set(
          id,
          [...list].sort((a, b) => a.timestamp - b.timestamp),
        );
    }
    groups = lists;
    effectGroups.set(effects, groups);
  }
  return groups;
}

/** The continuous effects that affect `id`, in timestamp order (CR 613.7). Usually none. */
export function effectsOn(state: GameState, id: ObjectId): readonly ContinuousEffect[] {
  if (state.continuousEffects.length === 0) return NONE;
  return groupEffects(state.continuousEffects).get(id) ?? NONE;
}
