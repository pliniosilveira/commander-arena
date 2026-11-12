/**
 * Pairing (CR 702.95, D-983): what the rest of the engine reads about which creature is paired with which, in a module that imports no rule that reads
 * `derive`, so `derive` itself can use it (as it does `rules/ring-bearer.ts`).
 *
 * A pair is two creatures that one player controls, linked from both sides by `GameObject.paired` (`with`: the other creature, `by`: the player who formed
 * the pair). The field is never read anywhere else: every reader asks one of the functions below (`test/paired-reads.test.ts` fails when another file reads
 * it), because a stored link can be stale for a moment (the partner left and is a new object, control changed, the partner is phased out) and the state-based
 * actions that clear it (`rules/pairing-sba.ts`) run only at the next priority point.
 *
 * Two readers, because phasing (CR 702.26b, 702.26d, D-234) is not a zone change or a change of control, so CR 702.95e does not end a pair when a creature
 * phases out, but a phased-out permanent is treated as though it does not exist, so what the pair gives is switched off while either is phased out.
 *
 * The reading is the owner's approved one and is not settled by the CR text: CR 702.26f (with 611.2b) ends "for as long as" effects that track a permanent when it phases
 * out, and CR 702.95a words the pair "for as long as both remain creatures on the battlefield under your control", which could be read as ending the pair; CR 702.95e does
 * not list phasing and CR 702.26d says phasing is no zone change or change of control. No published ruling was checked. Changing the reading is a change of `rules/pairing-sba.ts`.
 *
 * The two readers:
 * - `linkedPartnerOf`: the pair stands (both exist, on the battlefield or phased out, linked from both sides, controlled by the player who formed it). It decides
 *   whether a creature is "unpaired" (CR 702.95d: a creature that is paired can't be paired again, so a pair with a phased-out member is not re-formed), what
 *   the invariants check and what the state-based action clears.
 * - `partnerOf`: the pair stands and both are on the battlefield now: the partner a static ability, a condition and the view see.
 */
import type { ObjectId, SeatId } from '../ids';
import { setObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';

/** The permanent is in play: on the battlefield or phased out (CR 702.26b). */
function inPlay(obj: GameObject): boolean {
  return obj.zone === 'battlefield' || obj.zone === 'phased';
}

/**
 * Who controls the permanent (CR 110.2, 613.1b), also while it is phased out: `controllerOf` reads the layer 2 effects of a permanent on the battlefield
 * only, but phasing is not a change of control (CR 702.26d) and the effects on a phased-out permanent are back as it phases in.
 */
function controlOf(state: GameState, obj: GameObject): SeatId {
  return obj.zone === 'phased'
    ? controllerOf(state, { ...obj, zone: 'battlefield' })
    : controllerOf(state, obj);
}

/**
 * CR 702.95a, 702.95d, 702.95e: the creature the object is paired with, while the pair stands: the other creature exists and is in play (on the battlefield
 * or phased out), it points back at this one for the same player, and that player controls both. Null for an object that is not paired and for a
 * link that no longer holds. Whether the creatures are still creatures is not asked here (CR 613.1d: that needs `derive`, which this module may not use;
 * `rules/pairing-sba.ts` ends the pair when one stops being a creature).
 */
export function linkedPartnerOf(state: GameState, obj: GameObject): GameObject | null {
  const link = obj.paired;
  if (link === undefined || !inPlay(obj)) return null;
  const other = state.objects[link.with];
  if (other === undefined || !inPlay(other)) return null;
  if (other.paired?.with !== obj.id || other.paired.by !== link.by) return null;
  if (controlOf(state, obj) !== link.by || controlOf(state, other) !== link.by) return null;
  return other;
}

/**
 * The creature the object is paired with now (CR 702.95b), for what the pair gives: `linkedPartnerOf`, and both on the battlefield. A creature that is
 * phased out is treated as though it does not exist (CR 702.26b), so it has no partner and its partner has none while it is out.
 */
export function partnerOf(state: GameState, obj: GameObject): GameObject | null {
  if (obj.paired === undefined || obj.zone !== 'battlefield') return null;
  const other = linkedPartnerOf(state, obj);
  return other !== null && other.zone === 'battlefield' ? other : null;
}

/** CR 702.95b: the creature is paired (the pair stands, even with a member phased out). An "unpaired" creature is one that is not. */
export function isPaired(state: GameState, obj: GameObject): boolean {
  return obj.paired !== undefined && linkedPartnerOf(state, obj) !== null;
}

/** The object without the designation (`patchObject` merges, so it could not remove the key, which the hash reads). */
export function withoutPaired(obj: GameObject): GameObject {
  const { paired: _gone, ...rest } = obj;
  return rest;
}

/** CR 702.95a, 702.95b: `a` and `b` become paired, by `by`. The caller has checked everything CR 702.95c and 702.95d ask (`rules/pair.ts`). */
export function pairObjects(state: GameState, a: ObjectId, b: ObjectId, by: SeatId): GameState {
  const first = state.objects[a];
  const second = state.objects[b];
  if (first === undefined || second === undefined) return state;
  return setObject(setObject(state, { ...first, paired: { with: b, by } }), {
    ...second,
    paired: { with: a, by },
  });
}

/** Clears the designation on the object, if it is still there. */
export function clearPaired(state: GameState, id: ObjectId): GameState {
  const obj = state.objects[id];
  return obj === undefined || obj.paired === undefined
    ? state
    : setObject(state, withoutPaired(obj));
}
