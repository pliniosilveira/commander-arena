/**
 * "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." (CR 614.1a, 122.6,
 * 616.1): the replacement effect `countersPlus` of the permanents on the battlefield, read from the abilities they have now (so "loses all abilities" turns it off,
 * CR 613.1f).
 *
 * Every place that puts counters of a kind on a permanent asks here for the number that is put on: `addCounters` (and so every effect, trigger and keyword that puts
 * counters on something), monstrosity, connive, amass, proliferate, Promise of Loyalty's counter and the counters a permanent or a token enters with (`entryCounters`:
 * CR 614.12, the permanent as it would be on the battlefield, read against the game without it, its own ability applying to itself). The effect adds to the number: it
 * applies once to one putting of counters (CR 614.5) and, as every effect only adds, the order of several of them (CR 616.1) never changes the result, so the player is
 * never asked. A putting of no counters is no event and is not replaced.
 *
 * A counter that can't be put on (`cantHaveCounters`, D-380) is not put on, so nothing is replaced then: the callers check that first.
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { withoutBlockedCounters } from './counter-prevention';
import { derive } from './derive';
import { matchesFilter } from './select';

type CountersPlus = Extract<Replacement, { kind: 'countersPlus' }>;

/** One `countersPlus` ability: whose permanent it is and what it adds. */
export interface CounterBonus {
  readonly source: ObjectId;
  readonly holder: SeatId;
  readonly effect: CountersPlus;
}

const hasCountersPlus = (abilities: ReturnType<typeof derive>['abilities']): boolean =>
  abilities.some((a) => a.kind === 'replacement' && a.replacement.kind === 'countersPlus');

/**
 * The `countersPlus` abilities of the permanents on the battlefield as `derive` has them now. Empty in nearly every game, so a caller that puts many counters reads
 * this once and asks `bonusCounters` for each (a cheap check of the copiable abilities comes first).
 */
export function counterBonuses(state: GameState): readonly CounterBonus[] {
  const found: CounterBonus[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || !hasCountersPlus(copiableValues(state, obj).abilities)) continue;
    const holder = controllerOf(state, obj);
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind === 'replacement' && ability.replacement.kind === 'countersPlus') {
        found.push({ source: id, holder, effect: ability.replacement });
      }
    }
  }
  return found;
}

/** The number of counters of the kind `counter` that `count` become on `target` (CR 614.1a): `count` and the extra counters of each effect that names `target`. */
export function bonusCounters(
  state: GameState,
  bonuses: readonly CounterBonus[],
  target: GameObject,
  counter: string,
  count: number,
): number {
  if (count <= 0) return count;
  let total = count;
  for (const b of bonuses) {
    if (b.effect.counter !== counter) continue;
    const ctx = { controller: b.holder, source: b.source };
    if (matchesFilter(state, target, { ...b.effect.what, zone: 'battlefield' }, ctx)) {
      total += b.effect.extra;
    }
  }
  return total;
}

/** `bonusCounters` for one putting, reading the effects now: the number of `counter` counters put on the permanent `target`, which is on the battlefield, instead of `count`. */
export function counterCountOn(
  state: GameState,
  target: GameObject,
  counter: string,
  count: number,
): number {
  if (count <= 0) return count;
  return bonusCounters(state, counterBonuses(state), target, counter, count);
}

/**
 * `counters` of a permanent that enters (`target` is the permanent as it would be on the battlefield, `state` the game without it, CR 614.12) as they are put on it:
 * the kinds that can't be put on it dropped whole (CR 122.6, D-380) and the others with the extra counters of every `countersPlus` effect that names it, its own ability
 * included. The counters it enters with are put on it together, so each effect applies once to them. A copy of the map.
 */
export function entryCounters(
  state: GameState,
  target: GameObject,
  counters: Readonly<Record<string, number>>,
): Record<string, number> {
  const kept = withoutBlockedCounters(state, target, counters);
  const bonuses = [...counterBonuses(state)];
  // CR 614.12: a permanent's replacement effects also apply to itself as it enters.
  for (const ability of copiableValues(state, target).abilities) {
    if (ability.kind === 'replacement' && ability.replacement.kind === 'countersPlus') {
      bonuses.push({
        source: target.id,
        holder: controllerOf(state, target),
        effect: ability.replacement,
      });
    }
  }
  if (bonuses.length === 0) return kept;
  for (const [counter, n] of Object.entries(kept)) {
    kept[counter] = bonusCounters(state, bonuses, target, counter, n);
  }
  return kept;
}
