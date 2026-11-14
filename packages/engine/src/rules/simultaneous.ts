/**
 * Permanents that leave the battlefield in one event (D-283). CR 603.10a: abilities that trigger on a permanent leaving the battlefield look back in time,
 * and the CR's own example is two permanents put into graveyards at the same time, each seeing the other. The engine moves them one after the other, so
 * what the later ones were (and what abilities they had, which a neighbour may have granted: layer 6, CR 613.1f) must be written down before the first
 * moves. `recordTogether` does that for the instructions of one effect; the state-based-action check does it for its own batch (`rules/sba.ts`).
 *
 * Each record is made against the state as the event began and marked on the move (`lkiRecorded`), so the move keeps it. A record of a permanent that
 * then did not leave (a regeneration shield, a replaced move) is never reused: only a flagged move keeps a record, and any later departure records anew.
 */
import type { ObjectId } from '../ids';
import type { GameState, Instruction } from '../state/types';
import { recordLastKnown } from './zones';

/**
 * The last-known information of the battlefield permanents `ids` recorded now, for a mover that moves objects directly (a cost that sacrifices several
 * permanents, the legend rule) and passes `lkiRecorded` on each move. Nothing is recorded for fewer than two: a lone departure records itself.
 */
export function recordObjectsTogether(state: GameState, ids: readonly ObjectId[]): GameState {
  const leaving = ids.filter((id) => state.objects[id]?.zone === 'battlefield');
  if (leaving.length < 2) return state;
  let next = state;
  for (const id of leaving) {
    const obj = state.objects[id];
    if (obj !== undefined) next = recordLastKnown(next, obj, leaving);
  }
  return next;
}

/** The instructions with the last-known information of the battlefield permanents among them recorded now, when there are several. */
export function recordTogether(
  state: GameState,
  instructions: readonly Instruction[],
): { readonly state: GameState; readonly instructions: Instruction[] } {
  const leaving = instructions.filter(
    (i) =>
      (i.kind === 'move' || i.kind === 'sacrifice') &&
      state.objects[i.object]?.zone === 'battlefield',
  );
  if (leaving.length < 2) return { state, instructions: [...instructions] };
  let next = state;
  const departedTogether = leaving.flatMap((i) =>
    i.kind === 'move' || i.kind === 'sacrifice' ? [i.object] : [],
  );
  for (const i of leaving) {
    if (i.kind !== 'move' && i.kind !== 'sacrifice') continue;
    const obj = state.objects[i.object];
    if (obj !== undefined) next = recordLastKnown(next, obj, departedTogether);
  }
  return {
    state: next,
    instructions: instructions.map((i) =>
      (i.kind === 'move' || i.kind === 'sacrifice') && leaving.includes(i)
        ? { ...i, lkiRecorded: true as const }
        : i,
    ),
  };
}
