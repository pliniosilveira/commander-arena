/**
 * Who controls a permanent (CR 110.2, 613.1b, D-189). The stored `GameObject.controller` is the player the object entered under (CR 110.2a: its
 * owner, unless the effect that put it there said otherwise) and is what a spell or ability on the stack has (CR 112.7a); a control-changing effect
 * is a layer 2 continuous effect (CR 613.1b, applied after the copiable values of layer 1 and before everything else), so what a permanent's
 * controller is right now is derived. Every rule reads it through `controllerOf`, never from the field (`test/control-reads.test.ts`).
 *
 * The effects are `ContinuousEffect`s of change `control` (`state.continuousEffects`), in timestamp order (CR 613.7): the last one decides, and one
 * that ends leaves the rest. Nothing here reads `derive`: layer 2 comes before the layers `derive` applies and what static abilities of
 * permanents match ("creatures you control") needs the controller first.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { effectsOn } from './effects-on';

/**
 * The controller of `obj` (CR 110.2): for a permanent on the battlefield the stored controller as the layer 2 effects on it change it, for any
 * other object (a spell or ability on the stack, a card in a hand or a graveyard) the stored one.
 */
export function controllerOf(state: GameState, obj: GameObject): SeatId {
  if (obj.zone !== 'battlefield' || state.continuousEffects.length === 0) return obj.controller;
  let seat = obj.controller;
  for (const e of effectsOn(state, obj.id)) {
    if (e.change.kind === 'control') seat = e.change.seat;
  }
  return seat;
}

/**
 * When `obj` last came under the control of the player who controls it now, as a timestamp (CR 302.6: "has been under its controller's control
 * continuously since their most recent turn began"): the later of the time it came under its stored controller's control (`timestamp`), the time
 * control last went back to somebody as an effect ended (`controlChangedAt`) and the effect, among those on it, that gave control to a player other
 * than the one who had it before. An effect that gives control to the player who has it already changes nothing.
 */
export function controlledSince(state: GameState, obj: GameObject): number {
  let since = Math.max(obj.timestamp, obj.controlChangedAt ?? 0);
  if (obj.zone !== 'battlefield' || state.continuousEffects.length === 0) return since;
  let seat: SeatId = obj.controller;
  for (const e of effectsOn(state, obj.id)) {
    if (e.change.kind !== 'control' || e.change.seat === seat) continue;
    seat = e.change.seat;
    since = Math.max(since, e.timestamp);
  }
  return since;
}

/** When the effect that makes `obj` be controlled by another player than it entered under ends, as the view says it (D-189). */
export type ControlEnd =
  | 'endOfTurn'
  | 'never'
  | { readonly endOfTurnOf: SeatId }
  | { readonly whileControlling: ObjectId };

/**
 * For a permanent controlled by someone other than the player it entered under: when the control-changing effect that decides that ends, the last of the
 * effects on it (CR 613.7). Undefined for a permanent controlled by its stored controller.
 */
export function controlEndOf(state: GameState, obj: GameObject): ControlEnd | undefined {
  if (obj.zone !== 'battlefield' || controllerOf(state, obj) === obj.controller) return undefined;
  let found: ControlEnd | undefined;
  for (const e of effectsOn(state, obj.id)) {
    if (e.change.kind !== 'control') continue;
    if (e.until === 'endOfTurn') found = 'endOfTurn';
    else if (e.until === 'permanent') found = 'never';
    else if (e.until.kind === 'turnEnd') found = { endOfTurnOf: e.until.seat };
    else if (e.until.kind === 'whileControlling') found = { whileControlling: e.until.source };
    else found = undefined;
  }
  return found;
}
