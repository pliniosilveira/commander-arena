/**
 * Untapping a permanent (CR 502.3, 701.26b) and the stun counter (CR 122.1d, D-145): "If a permanent with a stun counter on it would
 * become untapped, instead remove a stun counter from it." Every way a permanent untaps (the untap step, an effect) goes through here,
 * so the replacement applies to all of them. Only a tapped permanent would become untapped.
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { getObject, patchObject } from '../state/ops';
import type { GameState } from '../state/types';

/** The counter that stops a permanent from untapping (CR 122.1d). */
export const STUN_COUNTER = 'stun';

export interface Untapped {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * The permanent `id` untaps, or loses a stun counter instead (CR 122.1d: one counter for each time it would untap, and it stays
 * tapped). Nothing happens to a permanent that is not tapped, or that has left.
 */
export function untapPermanent(state: GameState, id: ObjectId): Untapped {
  const obj = state.objects[id];
  if (obj === undefined || obj.zone !== 'battlefield' || !obj.tapped) return { state, events: [] };
  if ((obj.counters[STUN_COUNTER] ?? 0) > 0) {
    const { [STUN_COUNTER]: stun = 0, ...others } = getObject(state, id).counters;
    return {
      state: patchObject(state, id, {
        counters: stun > 1 ? { ...others, [STUN_COUNTER]: stun - 1 } : others,
      }),
      events: [{ kind: 'counterRemoved', object: id, counter: STUN_COUNTER, count: 1 }],
    };
  }
  return {
    state: patchObject(state, id, { tapped: false }),
    events: [{ kind: 'untapped', object: id }],
  };
}
