/**
 * The permanents a cost "Remove two +1/+1 counters from among creatures you control" may take counters from (CR 118.3, 122.1; `rules/activate-remove-counters.ts`).
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controlledCandidates } from './sacrifice';

/**
 * The permanents `seat` controls that the filter matches and that have a counter of the kind (CR 122.1), and how many such counters there are in all. Removing is not putting, so
 * nothing that stops counters being put on a permanent holds one back (CR 122.6 reads counters put on an object).
 */
export function removalCounters(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
  counter: string,
): { readonly candidates: ObjectId[]; readonly total: number } {
  const candidates = controlledCandidates(state, seat, source, filter).filter(
    (id) => (state.objects[id]?.counters[counter] ?? 0) > 0,
  );
  const total = candidates.reduce(
    (sum, id) => sum + (state.objects[id]?.counters[counter] ?? 0),
    0,
  );
  return { candidates, total };
}
