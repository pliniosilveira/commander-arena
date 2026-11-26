/**
 * "As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments" (Sin, Unending Cataclysm; CR 614.12, 122.1): a static ability the
 * permanent applies as it enters, with a choice its controller makes before it is on the battlefield (`asEntersRemoveCounters`). The zone-change pipeline (`rules/zones.ts`) and the
 * creation of a token (`rules/enter-token.ts`) both read it here, so they cannot disagree. The answer is a `choosePermanent` decision of purpose `entersRemoveCounters`; the
 * counters come off through `counterRemoved` events, as any counter removed does, and the number removed is what `entersWithCounters` of `countersRemovedAsEntered` reads.
 */
import type { Ability, ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { ChoosePermanentDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { matchesFilter } from './select';

/**
 * The "remove all counters from ..." these abilities have as the permanent enters, or null: the filter of the permanents, and whether it is "from all" of them (Thief of Blood, no
 * choice) rather than "from any number of" them (Sin, a choice). A face has at most one (`validateCard`).
 */
export function entersRemoveCountersOf(
  abilities: readonly Ability[],
): { readonly filter: ObjectFilter; readonly all: boolean } | null {
  for (const a of abilities) {
    if (a.kind === 'replacement' && a.replacement.kind === 'asEntersRemoveCounters') {
      return { filter: a.replacement.filter, all: a.replacement.all === true };
    }
  }
  return null;
}

/**
 * The permanents that have a counter and that `filter` matches, of every player, in battlefield order. A permanent with no counter is no choice: removing nothing from it
 * changes nothing. The entering permanent is not on the battlefield yet, so it is never one of them (CR 614.12).
 */
export function removeCountersCandidates(
  state: GameState,
  seat: SeatId,
  filter: ObjectFilter,
  source: ObjectId,
): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    if (obj === undefined) return false;
    if (!Object.values(obj.counters).some((n) => n > 0)) return false;
    return matchesFilter(
      state,
      obj,
      { ...filter, zone: 'battlefield' },
      { controller: seat, source },
    );
  });
}

/** The question: which of `legal` lose all their counters, any number (none included) of them. */
export function removeCountersDecision(
  seat: SeatId,
  source: ObjectId,
  legal: readonly ObjectId[],
): Omit<ChoosePermanentDecision, 'id'> {
  return {
    kind: 'choosePermanent',
    seat,
    source,
    subject: source,
    purpose: 'entersRemoveCounters',
    min: 0,
    max: legal.length,
    legal,
  };
}

/**
 * Takes every counter of every kind off each permanent of `ids` that is still on the battlefield (CR 122.1, 122.2): one `counterRemoved` event for each kind. `count` is the
 * number of counters that came off, which the entering permanent counts (twice, for Sin).
 */
export function removeAllCountersAsEntering(
  input: GameState,
  ids: readonly ObjectId[],
): { state: GameState; events: GameEvent[]; count: number } {
  let state = input;
  const events: GameEvent[] = [];
  let count = 0;
  for (const id of new Set(ids)) {
    const obj = state.objects[id];
    if (obj?.zone !== 'battlefield') continue;
    for (const [counter, n] of Object.entries(obj.counters)) {
      if (n <= 0) continue;
      events.push({ kind: 'counterRemoved', object: id, counter, count: n });
      count += n;
    }
    if (Object.keys(obj.counters).length > 0) state = patchObject(state, id, { counters: {} });
  }
  return { state, events, count };
}
