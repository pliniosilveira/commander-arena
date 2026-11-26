/**
 * What a cost that removes counters other than "Remove a +1/+1 counter from this permanent" may take (CR 118.3, 122.1, 602.2b): the permanents, the counters that may come off next and
 * whether the whole cost can be paid. Shared by the legality of the activation (`rules/activate-costs.ts`) and its payment (`rules/activate-remove-counters.ts`), which imports this.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameState } from '../state/types';
import type { CounterPickOption } from './counter-pick';
import { removalCounters } from './remove-counters-candidates';
import { controlledCandidates } from './sacrifice';

/**
 * The counters a cost removes other than the plain "Remove a +1/+1 counter from this permanent" (CR 118.3, 122.1, 602.2b): `counter` the kind, or none for any; `count` how many (the X
 * announced for `countX`); `filter` the permanents the player controls they come off, or null for the permanent with the ability; `fromOne` all of them off one permanent.
 */
export interface RemoveCountersSpec {
  readonly counter: string | undefined;
  readonly count: number;
  readonly filter: ObjectFilter | null;
  readonly fromOne: boolean;
}

/**
 * Whether the cost names a kind of counter and permanents the player controls, which the player answers by choosing the permanent each counter comes off (the older reading, Federation
 * Fleet group D). Any other cost has the player pick the counter itself.
 */
export const picksPermanents = (spec: RemoveCountersSpec): boolean =>
  spec.counter !== undefined && spec.filter !== null && !spec.fromOne;

/**
 * The permanents the cost may take counters from, which `seat` controls: the permanent with the ability when the cost names none (`filter` null), the one the first counter came off
 * (`fixed`) when all of them come off one, else those the filter matches.
 */
function permanentsOf(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter | null,
  fixed: ObjectId | undefined,
): ObjectId[] {
  if (fixed !== undefined) return state.objects[fixed]?.zone === 'battlefield' ? [fixed] : [];
  if (filter === null) {
    const obj = source === null ? undefined : state.objects[source];
    return source !== null && obj?.zone === 'battlefield' ? [source] : [];
  }
  return controlledCandidates(state, seat, source, filter);
}

/**
 * Every counter that may come off next (CR 122.1): the permanent, the kind and how many of the kind it has. With `fromOne` and no permanent fixed yet, only the permanents with at
 * least `owed` counters in all.
 */
export function removalPicks(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  spec: RemoveCountersSpec,
  owed: number,
  fixed: ObjectId | undefined,
): { readonly picks: CounterPickOption[]; readonly total: number } {
  const picks: CounterPickOption[] = [];
  let total = 0;
  for (const id of permanentsOf(state, seat, source, spec.filter, fixed)) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const here: CounterPickOption[] = [];
    for (const [counter, count] of Object.entries(obj.counters)) {
      if (count > 0 && (spec.counter === undefined || spec.counter === counter)) {
        here.push({ object: id, counter, count });
      }
    }
    const held = here.reduce((sum, p) => sum + p.count, 0);
    // "Remove X counters from an artifact or creature you control": one permanent has to hold them all.
    if (spec.fromOne && fixed === undefined && held < owed) continue;
    picks.push(...here);
    total += held;
  }
  return { picks, total };
}

/**
 * Why the counters of the cost can't be removed (CR 118.3), or null: fewer counters than owed among the permanents, or for `fromOne` no permanent with as many as owed.
 */
export function removeCountersRefusal(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  spec: RemoveCountersSpec,
): string | null {
  if (spec.count <= 0) return null;
  if (picksPermanents(spec) && spec.filter !== null && spec.counter !== undefined) {
    return removalCounters(state, seat, source, spec.filter, spec.counter).total < spec.count
      ? `you control too few ${spec.counter} counters to remove`
      : null;
  }
  const { total } = removalPicks(state, seat, source, spec, spec.count, undefined);
  if (total >= spec.count) return null;
  const kind = spec.counter === undefined ? '' : `${spec.counter} `;
  return spec.fromOne
    ? `no permanent you control has ${spec.count} ${kind}counters to remove`
    : `you control too few ${kind}counters to remove`;
}
