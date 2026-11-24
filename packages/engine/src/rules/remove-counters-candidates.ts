/**
 * The permanents a cost "Remove two +1/+1 counters from among creatures you control" may take counters from (CR 118.3, 122.1; `rules/activate-remove-counters.ts`).
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import type { CounterPickOption } from './counter-pick';
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

/**
 * Every counter a cost "Remove a counter from a nonland permanent you control" may take (CR 118.3, 122.1): each kind of counter on each permanent the filter matches, in the order the
 * permanents are listed and then the order the kinds are kept. Nothing that stops counters being put on a permanent holds one back, as removing is not putting.
 */
export function anyCounterPicks(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
): CounterPickOption[] {
  return controlledCandidates(state, seat, source, filter).flatMap((id) =>
    Object.entries(state.objects[id]?.counters ?? {}).flatMap(([counter, count]) =>
      count > 0 ? [{ object: id, counter, count }] : [],
    ),
  );
}
