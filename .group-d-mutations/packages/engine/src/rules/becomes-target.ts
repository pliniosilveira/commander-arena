/**
 * "Becomes the target" (CR 601.2c, 602.2b, 603.3d): the events that tell triggered abilities such as
 * Ward (CR 702.21a) that a spell or ability has chosen an object as a target.
 *
 * The events are made when the spell becomes cast or the ability becomes activated, from the targets
 * its stack object holds (the choices were made earlier, in a separate decision; the events must
 * reach `grantPriority` with the rest of that step). A triggered ability's targets are chosen as it
 * goes on the stack (CR 603.3d); `targetsChosen` (trigger-stack.ts) calls this once they are chosen
 * and notes what the events trigger.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';

/** One `becameTarget` event per object the spell or ability on the stack targets (CR 603.2c). */
export function becameTargetEvents(
  state: GameState,
  stackObject: ObjectId,
  seat: SeatId,
): GameEvent[] {
  const targets = state.objects[stackObject]?.stack?.chosenTargets ?? [];
  const seen = new Set<ObjectId>();
  const events: GameEvent[] = [];
  for (const t of targets) {
    if (t.kind !== 'object' || seen.has(t.id)) continue;
    seen.add(t.id);
    events.push({ kind: 'becameTarget', object: t.id, by: stackObject, seat });
  }
  return events;
}
