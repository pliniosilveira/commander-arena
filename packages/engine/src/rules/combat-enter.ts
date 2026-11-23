import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { derive } from './derive';

/**
 * CR 508.4 (D-648): the creature tokens `created` that are on the battlefield and not attacking yet start attacking `defender` while a combat is on; they were never declared as
 * attackers, so nothing that triggers on an attack sees them and the turn log does not count them.
 */
export function enterCombatAttacking(
  state: GameState,
  created: readonly ObjectId[],
  defender: SeatId,
): GameState {
  const combat = state.combat;
  if (combat === null) return state;
  const entering = created.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      obj.zone === 'battlefield' &&
      derive(state, obj).types.includes('creature') &&
      !combat.attackers.some((a) => a.object === id)
    );
  });
  return {
    ...state,
    combat: {
      ...combat,
      attackers: [
        ...combat.attackers,
        ...entering.map((object) => ({
          object,
          target: { kind: 'player' as const, seat: defender },
          blocked: false,
        })),
      ],
    },
  };
}
