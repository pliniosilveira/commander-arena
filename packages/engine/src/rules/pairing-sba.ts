/**
 * CR 702.95e (D-983): a creature that is paired becomes unpaired if another player gains control of it or of the creature it is paired with, if it or its
 * partner stops being a creature, or if it or its partner leaves the battlefield. CR 704 does not list this as a state-based action; the engine does it
 * with them, as it does the Ring-bearer (D-196) and the city's blessing (D-264), so no moment of the change is missed.
 *
 * Most causes already show in the readers (`rules/pairing.ts`: a creature that left is a new object, control is read through `controllerOf`), so a pair that
 * ended reads as "unpaired" at once; this clears the fields so a pair does not come back (a creature that is given back to its controller later is not paired
 * again, CR 702.95e) and says it in the log. It is the one place that asks `derive` whether a paired creature is still a creature (CR 613.1d): reading
 * that inside the layers would be circular, since a pair gives abilities (layer 6, CR 613.1f) and a type-changing effect (layer 4) could depend on them.
 * So between a creature losing its types and the next state-based-action check, inside one resolution, the pair still gives what it gives
 * (`docs/ROADMAP.md`).
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';
import { clearPaired, linkedPartnerOf } from './pairing';

const isCreature = (state: GameState, obj: GameObject): boolean =>
  // A phased-out creature is treated as though it does not exist (CR 702.26b): nothing can make it stop being a creature meanwhile.
  obj.zone === 'phased' || derive(state, obj).types.includes('creature');

/**
 * Ends every pair that no longer stands. Returns null when there is nothing to end. An event is emitted once for each pair that ended with a creature left
 * on the battlefield to say it about.
 */
export function endBrokenPairs(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  const done = new Set<ObjectId>();
  for (const obj of Object.values(state.objects)) {
    if (obj.paired === undefined || done.has(obj.id)) continue;
    const partner = linkedPartnerOf(state, obj);
    if (partner !== null && isCreature(state, obj) && isCreature(state, partner)) continue;
    done.add(obj.id);
    next = clearPaired(next, obj.id);
    const gone = state.objects[obj.paired.with];
    if (gone === undefined || gone.paired?.with !== obj.id) {
      // The partner left (it is a new object, CR 400.7) or no longer points back: the one that stays says it ended.
      if (obj.zone === 'battlefield') {
        events.push({ kind: 'creaturesUnpaired', a: obj.id, b: obj.paired.with, why: 'left' });
      }
      continue;
    }
    done.add(gone.id);
    next = clearPaired(next, gone.id);
    if (obj.zone !== 'battlefield' && gone.zone !== 'battlefield') continue;
    // Both are still here: say why. The partner left the battlefield without a new object only if it phased out, which does not end a pair, so
    // the cause is control or a type.
    const why = partner === null ? 'control' : 'notCreature';
    events.push({ kind: 'creaturesUnpaired', a: obj.id, b: gone.id, why });
  }
  return events.length === 0 && next === state ? null : { state: next, events };
}
