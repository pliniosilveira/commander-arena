/** What can be attacked (CR 506.3): in a module of its own so that `reselect-attack.ts` can read it without the rest of the combat rules. */
import type { SeatId } from '../ids';
import type { AttackTarget } from '../state/combat-types';
import { getObject, opponentsOf } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** CR 506.3: a player, a planeswalker or a battle can be attacked. */
export function attackTargets(state: GameState, seat: SeatId): AttackTarget[] {
  const targets: AttackTarget[] = [];
  for (const opponent of opponentsOf(state, seat)) {
    targets.push({ kind: 'player', seat: opponent });
    for (const id of state.battlefield) {
      const obj = getObject(state, id);
      const types = derive(state, obj).types;
      if (types.includes('planeswalker') && controllerOf(state, obj) === opponent) {
        targets.push({ kind: 'permanent', object: id });
      } else if (types.includes('battle') && obj.protector === opponent) {
        targets.push({ kind: 'permanent', object: id });
      }
    }
  }
  return targets;
}
