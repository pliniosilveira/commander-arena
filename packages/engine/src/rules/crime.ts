/**
 * "Committing a crime" (CR 700.13, D-1410): a player commits a crime as they cast a spell, activate an ability or put a triggered ability on the stack
 * and that spell or ability targets at least one opponent; at least one permanent, spell or ability an opponent controls; and/or at least one card in
 * an opponent's graveyard.
 *
 * The event is made where the engine already announces that the targets became targets (`becomesTarget`): when a spell is cast (`cast.ts`), an ability
 * is activated (`activate.ts`) and a triggered ability goes on the stack with its targets chosen (`trigger-stack.ts`). A copy of a spell is put on the
 * stack but not cast (CR 707.10), so `copy-spell.ts` makes none. An opponent is any player other than the one who commits the crime (CR 102.2).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';
import { controllerOf } from './control';

/** Whether `target` (an object) is a permanent, spell or ability an opponent of `seat` controls, or a card in an opponent's graveyard. */
function opposesObject(state: GameState, id: ObjectId, seat: SeatId): boolean {
  const obj = state.objects[id];
  if (obj === undefined) return false;
  switch (obj.zone) {
    case 'battlefield':
    case 'stack':
      // A spell or an ability on the stack is controlled by the player who cast or activated it (or whose trigger it is): `controllerOf` reads that too.
      return controllerOf(state, obj) !== seat;
    case 'graveyard':
      return obj.owner !== seat;
    default:
      return false;
  }
}

/** Whether the spell or ability on the stack, put there by `seat`, has a target that makes it a crime (CR 700.13). */
export function isCrime(state: GameState, stackObject: ObjectId, seat: SeatId): boolean {
  const targets = state.objects[stackObject]?.stack?.chosenTargets ?? [];
  return targets.some((t) =>
    t.kind === 'player' ? t.seat !== seat : opposesObject(state, t.id, seat),
  );
}

/** The `crimeCommitted` event of the spell or ability `stackObject` that `seat` has just put on the stack; none when no target makes it a crime. */
export function crimeEvents(state: GameState, stackObject: ObjectId, seat: SeatId): GameEvent[] {
  return isCrime(state, stackObject, seat)
    ? [{ kind: 'crimeCommitted', seat, object: stackObject }]
    : [];
}
