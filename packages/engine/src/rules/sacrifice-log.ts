/**
 * The record of the permanents sacrificed this turn (`TurnLog.sacrificed`, CR 701.21a; Evendo Brushrazer: "as long as you've sacrificed a nontoken permanent this turn"). Every sacrifice
 * (`rules/sacrifice.ts`, devour in `rules/zones.ts`) writes one entry after the permanent has moved, with the card types it had as it was sacrificed (its last-known information, CR 113.7a).
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';

/** `after` is the state once `obj` (as it was in `before`) has been sacrificed by `seat`. */
export function recordSacrificed(
  before: GameState,
  after: GameState,
  obj: GameObject,
  seat: SeatId,
): GameState {
  return {
    ...after,
    turnLog: {
      ...after.turnLog,
      sacrificed: [
        ...(after.turnLog.sacrificed ?? []),
        {
          controller: seat,
          types: after.lki[obj.id]?.characteristics.types ?? derive(before, obj).types,
          token: obj.token !== null,
        },
      ],
    },
  };
}
