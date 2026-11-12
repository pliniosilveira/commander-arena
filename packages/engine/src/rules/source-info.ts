/**
 * What an ability's source looks like for display and for rules that read it: as it is, or as it
 * last existed if it has left the battlefield (CR 113.7a, 603.10a).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive, oracleTextOf } from './derive';
import { faceDownLabel } from './face-down';

export interface SourceInfo {
  readonly name: string;
  readonly oracleText: string;
  readonly controller: SeatId;
}

/** The object itself while it exists, otherwise its last-known information; null if neither. */
export function objectOrLki(state: GameState, id: ObjectId): GameObject | null {
  return state.objects[id] ?? state.lki[id]?.object ?? null;
}

export function sourceInfo(state: GameState, id: ObjectId): SourceInfo | null {
  const live = state.objects[id];
  if (live) {
    return {
      // CR 708.2, 708.5 (D-965): a face-down permanent has no name; it is shown by its label, never by its card.
      name: faceDownLabel(live) ?? derive(state, live).name,
      oracleText: oracleTextOf(state, live),
      controller: controllerOf(state, live),
    };
  }
  const lki = state.lki[id];
  if (!lki) return null;
  return {
    name: faceDownLabel(lki.object) ?? lki.characteristics.name,
    oracleText: lki.characteristics.oracleText,
    // Frozen when it left (`recordLki`): the controller it had then, which no effect changes now.
    controller: lki.object.controller, // stored controller: frozen as it left (`recordLki`)
  };
}
