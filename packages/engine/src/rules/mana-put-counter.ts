/**
 * "{T}: Put a charge counter on this artifact. Add X mana of any one color, where X is the number of charge counters on it." (Empowered Autogenerator; CR 605.1a, 605.3b, 122.6): the
 * counters a mana ability puts on its own permanent as the first thing it does, before its mana is added. A mana ability resolves at once, so the counters are there when the amount of
 * its production is counted. The placement is the one every effect has: a permanent that can't have counters of the kind gets none (CR 122.6) and an effect that adds to the number
 * put on (`countersPlus`, CR 614.1a) applies.
 *
 * A pure helper of the mana rules (no effect machinery, which would make the mana engine and the effects import each other): `ManaAbility.putCounter`.
 */
import type { ManaAbility } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { bonusCounters, counterBonuses } from './counter-bonus';
import { counterBlocked } from './counter-prevention';

/** The state after the ability put its counters on the permanent `id` (unchanged without them, or when the permanent can't have them), and the event. */
export function putOwnCounters(
  state: GameState,
  id: ObjectId,
  ability: Pick<ManaAbility, 'putCounter'>,
  by: SeatId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const put = ability.putCounter;
  const obj = state.objects[id];
  if (put === undefined || obj === undefined || obj.zone !== 'battlefield') {
    return { state, events: [] };
  }
  if (counterBlocked(state, obj, put.counter)) return { state, events: [] };
  const count = bonusCounters(state, counterBonuses(state), obj, put.counter, put.count);
  return {
    state: patchObject(state, id, {
      counters: { ...obj.counters, [put.counter]: (obj.counters[put.counter] ?? 0) + count },
    }),
    events: [{ kind: 'counterAdded', object: id, counter: put.counter, count, by }],
  };
}
