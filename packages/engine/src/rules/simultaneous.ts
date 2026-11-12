/**
 * Permanents that leave the battlefield in one event (D-981). CR 603.10a: abilities that trigger on a permanent leaving the battlefield look back in time,
 * and the CR's own example is two permanents put into graveyards at the same time, each seeing the other. The engine moves them one after the other, so
 * what the later ones were (and what abilities they had, which a neighbour may have granted: layer 6, CR 613.1f) must be written down before the first
 * moves. `recordTogether` does that for the instructions of one effect; the state-based-action check does it for its own batch (`rules/sba.ts`).
 *
 * Each record is made against the state as the event began and marked on the move (`lkiRecorded`), so the move keeps it. A record of a permanent that
 * then did not leave (a regeneration shield, a replaced move) is never reused: only a flagged move keeps a record, and any later departure records anew.
 */
import type { GameState, Instruction } from '../state/types';
import { recordLastKnown } from './zones';

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
  for (const i of leaving) {
    if (i.kind !== 'move' && i.kind !== 'sacrifice') continue;
    const obj = state.objects[i.object];
    if (obj !== undefined) next = recordLastKnown(next, obj);
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
