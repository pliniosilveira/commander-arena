/**
 * Phasing (CR 702.26, D-234). A permanent that phases out is treated as though it does not exist (CR 702.26b): the engine keeps it in the zone `'phased'` (`GameState.phased`),
 * so every rule that looks at the battlefield, at a zone or at a target does not see it. It is the same object (no zone change, CR 702.26d: no leaves-the-battlefield or enters
 * trigger, counters, damage, tapped status and attachments stay, it is not a new object for the history of its controller or its summoning sickness) and it is taken out of
 * combat (CR 506.4, 702.26b). The Auras, Equipment and Fortifications attached to it phase out with it, indirectly (CR 702.26g), and phase in with it (CR 702.26g).
 * The phased-out permanents that phased out under a player's control phase in as that player's untap step begins, before the untap (CR 702.26a), all at once.
 * Not built: the keyword Phasing (a permanent that phases out in each untap step of its own accord), a player who leaves the game with phased-out permanents (CR 702.26k, 702.26n).
 */
import type { ObjectId, SeatId } from '../ids';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { removeFromCombat } from './combat-removal';
import { controllerOf } from './control';

/** The permanents on the battlefield that are attached to `host`, as the objects say it (Auras, Equipment, Fortifications). */
function attachedTo(state: GameState, host: ObjectId): ObjectId[] {
  return state.battlefield.filter((id) => state.objects[id]?.attachedTo === host);
}

/** Phases out each of `ids` that is on the battlefield, with what is attached to it. Nothing is emitted: a phasing event is no zone change (CR 702.26d). */
export function phaseOut(state: GameState, ids: readonly ObjectId[]): GameState {
  let next = state;
  const direct = ids.filter((id) => next.objects[id]?.zone === 'battlefield');
  // CR 702.26h: what would phase out both directly and indirectly just phases out indirectly (it phases in with its host).
  const phasing = new Map<ObjectId, SeatId>();
  for (const id of direct) {
    const obj = next.objects[id];
    if (obj === undefined) continue;
    const seat = controllerOf(next, obj);
    phasing.set(id, seat);
    for (const attached of attachedTo(next, id)) phasing.set(attached, seat);
  }
  for (const [id, seat] of phasing) {
    const obj = next.objects[id];
    if (obj === undefined || obj.zone !== 'battlefield') continue;
    // CR 506.4, 702.26b: a permanent that phases out is removed from combat.
    next = removeFromCombat(next, id).state;
    next = {
      ...next,
      battlefield: next.battlefield.filter((b) => b !== id),
      phased: [...(next.phased ?? []), id],
    };
    next = patchObject(next, id, { zone: 'phased', phasedBy: seat });
  }
  return next;
}

/** CR 702.26a: as the untap step of `seat` begins, the permanents that phased out under their control phase in. */
export function phaseInFor(state: GameState, seat: SeatId): GameState {
  const due = (state.phased ?? []).filter((id) => state.objects[id]?.phasedBy === seat);
  if (due.length === 0) return state;
  let next: GameState = {
    ...state,
    phased: (state.phased ?? []).filter((id) => !due.includes(id)),
    battlefield: [...state.battlefield, ...due],
  };
  for (const id of due) {
    const obj = next.objects[id];
    if (obj === undefined) continue;
    const { phasedBy: _by, ...rest } = obj;
    next = {
      ...next,
      objects: { ...next.objects, [id]: { ...rest, zone: 'battlefield' as const } },
    };
  }
  return next;
}
