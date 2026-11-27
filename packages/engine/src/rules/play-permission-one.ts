/**
 * "Until end of turn, you may play one of those cards." (`mayPlay` with `oneOf`, Nashi, Moon Sage's Scion; CR 601.2, 305.1, 611.2a): the permissions of one effect share a key
 * (`ContinuousEffect` `playPermission` `oneOf`). Casting or playing a card from exile with one of them uses up the whole effect: the permissions that name the other cards end, so the
 * player has played one card of them and no other. The permission that names the card itself is gone with it, which is a new object once it leaves exile (CR 400.7).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';

/** `state` without the permissions that `seat` shares, through a `oneOf` key, with the one that names the card `object`. */
export function endOneOfPermissions(state: GameState, seat: SeatId, object: ObjectId): GameState {
  const keys = new Set(
    state.continuousEffects.flatMap((e) =>
      e.change.kind === 'playPermission' &&
      e.change.seat === seat &&
      e.change.oneOf !== undefined &&
      e.objects.includes(object)
        ? [e.change.oneOf]
        : [],
    ),
  );
  if (keys.size === 0) return state;
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (e) =>
        !(
          e.change.kind === 'playPermission' &&
          e.change.oneOf !== undefined &&
          keys.has(e.change.oneOf)
        ),
    ),
  };
}
