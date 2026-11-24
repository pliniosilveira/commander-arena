/**
 * The moments a static control effect (`static-control.ts`) gives a permanent to another player or lets it go, seen as the state-based actions are checked (CR 613.1b,
 * 506.4, 302.6). The effect needs no event to begin or end (the monarch changes, an Aura is attached or leaves), so the controller each affected permanent had when it was
 * last looked at is kept on the permanent (`GameObject.staticControlSeen`) and compared with the one it has now: a permanent whose controller is another leaves combat (CR 506.4),
 * and has not been under its new controller's control since their turn began (CR 302.6, `controlChangedAt`).
 */
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, setObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { removeAttackedFromCombat, removeFromCombat } from './combat-removal';
import { controllerOf, controllerWithoutStatics } from './control';
import { staticControls } from './static-control';

/** A copy of `obj` without the marker of the controller last seen. */
function unmarked(obj: GameObject): GameObject {
  const { staticControlSeen: _seen, ...rest } = obj;
  return rest;
}

/**
 * Brings the permanents under a static control effect up to date. Returns null when nothing changed: no permanent has a different controller than the one it was last
 * seen with, and every marker is right.
 */
export function settleStaticControl(
  input: GameState,
): { state: GameState; events: GameEvent[] } | null {
  const hosts = staticControls(input);
  let state = input;
  const events: GameEvent[] = [];
  let changed = false;
  let stamp: number | null = null;
  for (const id of input.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const marked: SeatId | undefined = obj.staticControlSeen;
    const affected = hosts.has(id);
    if (marked === undefined && !affected) continue;
    const now = controllerOf(state, obj);
    const was = marked ?? controllerWithoutStatics(state, obj);
    if (now === was && affected && marked === now) continue;
    changed = true;
    let next: GameObject = affected ? { ...obj, staticControlSeen: now } : unmarked(obj);
    if (now !== was) {
      events.push({ kind: 'controlChanged', object: id, from: was, to: now });
      if (stamp === null) {
        const [fresh, stamped] = allocateTimestamp(state);
        stamp = fresh;
        state = stamped;
      }
      next = { ...next, controlChangedAt: stamp };
    }
    state = setObject(state, next);
    if (now === was) continue;
    // CR 506.4: a permanent is removed from combat if its controller changes; an attacked planeswalker or battle as well, it stops being attacked (CR 506.4c).
    const left = removeFromCombat(state, id);
    state = left.state;
    if (left.removed) events.push({ kind: 'removedFromCombat', object: id });
    const attacked = removeAttackedFromCombat(state, id);
    state = attacked.state;
    if (attacked.removed) events.push({ kind: 'removedFromCombat', object: id });
  }
  return changed ? { state, events } : null;
}
