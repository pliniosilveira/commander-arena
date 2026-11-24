import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { bonusCounters, type counterBonuses } from './counter-bonus';
import { blocks, type counterBlockers } from './counter-prevention';

/**
 * Puts `count` counters of a kind on one object as the effect of a spell or ability (CR 122.6, 101.2, D-380): nothing if the object is gone
 * or can't have counters of the kind. `read` is the state the counter blockers were read from.
 */
export function putCountersOn(
  read: GameState,
  state: GameState,
  id: ObjectId,
  counter: string,
  count: number,
  by: SeatId,
  blockers: ReturnType<typeof counterBlockers>,
  bonuses: ReturnType<typeof counterBonuses>,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const obj = state.objects[id];
  if (!obj || blocks(read, blockers, obj, counter)) return { state, events: [] };
  // CR 614.1a, 122.6: "that many plus one counters are put on it instead" (`countersPlus`).
  const put = bonusCounters(read, bonuses, obj, counter, count);
  return {
    state: patchObject(state, id, {
      counters: { ...obj.counters, [counter]: (obj.counters[counter] ?? 0) + put },
    }),
    events: [{ kind: 'counterAdded', object: id, counter, count: put, by }],
  };
}
