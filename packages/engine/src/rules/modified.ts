/**
 * "Modified" (CR 700.9, D-1240): a permanent is modified if it has a counter on it, is equipped (an Equipment is attached to it) or is enchanted by an Aura
 * that its controller controls. Equipment, Auras controlled by the permanent's controller and counters are the modifications; an Aura an opponent
 * controls is not one (the Oracle reminder text of the cards says so: "Equipment, Auras you control, and counters are modifications").
 *
 * It is read where a filter is matched against the game (`select.ts`): what is attached to a permanent is not a characteristic and `derive` cannot know it
 * while it matches the subject of a static ability, so `validateCard` refuses `ObjectFilter.modified` there. An attachment that has phased out is not on the
 * battlefield (CR 702.26b: it is treated as though it does not exist) and is no modification.
 */
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** The permanents on the battlefield that are attached to `host`, oldest attachment first (CR 613.7: by timestamp). */
export function attachmentsOf(state: GameState, host: ObjectId): readonly GameObject[] {
  const found: GameObject[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj !== undefined && obj.attachedTo === host) found.push(obj);
  }
  return found.sort((a, b) => a.timestamp - b.timestamp);
}

/** Whether `obj`, a permanent on the battlefield, is modified (CR 700.9). */
export function isModified(state: GameState, obj: GameObject): boolean {
  if (obj.zone !== 'battlefield') return false;
  if (Object.values(obj.counters).some((n) => n > 0)) return true;
  const owner = controllerOf(state, obj);
  return attachmentsOf(state, obj.id).some((attached) => {
    const subtypes = derive(state, attached).subtypes;
    if (subtypes.includes('Equipment')) return true;
    return subtypes.includes('Aura') && controllerOf(state, attached) === owner;
  });
}
