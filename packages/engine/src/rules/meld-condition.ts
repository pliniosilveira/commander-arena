/**
 * The condition of the meld ability (D-992, CR 603.4, 701.42a): "if you both own and control this creature and a creature named X". Apart from `rules/meld.ts` so that
 * `rules/conditions.ts` can read it without the zone-change pipeline (which reads conditions itself).
 */
import type { Condition } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { twoCommanderCards } from './melded';

/** Whether the permanent is on the battlefield and both owned and controlled by `seat` (the meld ability says "you both own and control"). */
export function ownedAndControlledBy(state: GameState, obj: GameObject, seat: SeatId): boolean {
  return obj.zone === 'battlefield' && obj.owner === seat && controllerOf(state, obj) === seat;
}

/**
 * The permanents of the card type named `name` that `seat` owns and controls, other than `source`, in the order of the battlefield. Not the one that, with `source`, is
 * two commander cards: that meld is not built (`twoCommanderCards`), so such a permanent is not a candidate.
 */
export function namedCandidates(
  state: GameState,
  source: GameObject,
  seat: SeatId,
  name: string,
  type: Extract<Condition, { kind: 'ownsAndControlsNamed' }>['type'],
): GameObject[] {
  const found: GameObject[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || obj.id === source.id || !ownedAndControlledBy(state, obj, seat)) {
      continue;
    }
    if (twoCommanderCards(state, source, obj)) continue;
    const d = derive(state, obj);
    if (d.name === name && d.types.includes(type)) found.push(obj);
  }
  return found;
}

/**
 * CR 603.4, 701.42a (D-992): "if you both own and control this creature and a creature named X": the permanent the ability belongs to is on the battlefield,
 * owned and controlled by the controller of the ability, and so is another permanent of the card type whose name is now `name`.
 */
export function ownsAndControlsNamedHolds(
  state: GameState,
  condition: Extract<Condition, { kind: 'ownsAndControlsNamed' }>,
  controller: SeatId,
  source: ObjectId | null,
): boolean {
  const own = source === null ? undefined : state.objects[source];
  if (own === undefined || !ownedAndControlledBy(state, own, controller)) return false;
  return namedCandidates(state, own, controller, condition.name, condition.type).length > 0;
}
