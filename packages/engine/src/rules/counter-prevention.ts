/**
 * "Creatures you control can't have -1/-1 counters put on them" (CR 122.6, 101.2, 604.1; D-1152): the static ability `cantHaveCounters` of the permanents on
 * the battlefield, read from the abilities they have now (so "loses all abilities" turns it off, CR 613.1f).
 *
 * Every place that puts a counter on a permanent asks here first, one gate for all of them (`counterBlockers` and `blocks` for a permanent that is on the
 * battlefield, `withoutBlockedCounters` for the counters a permanent or a token enters with): `addCounters` (and so every effect, trigger and keyword that
 * puts counters on something), wither and infect damage, proliferate, the counters of a cost (loyalty included), a Saga's lore counter, connive, empower, the
 * counters a copy of a planeswalker takes, a cumulative upkeep's age counter, and the counters a permanent enters with (CR 122.6: "counters put on an object"
 * includes the ones it is given as it enters the battlefield: a token, a card put onto the battlefield, a persist or undying return, riot, devour, an "enters
 * with" ability and the "each other Angel you control enters with an additional +1/+1 counter" of the permanents already there).
 *
 * A counter that can't be put on is simply not put on: no change to the permanent, and no `counterAdded` event, so nothing that triggers on counters being
 * put on a permanent triggers and a trigger that counts them sees none. The rest of what the effect did still happens (CR 101.2: a "can't" effect makes the
 * counters not be put, it does not undo the effect). A counter the permanent already has stays, and nothing here stops it being removed or moved off.
 *
 * Counters on cards in other zones (the time counters of a suspended card) are not read: the subject of the ability is a permanent on the battlefield.
 */
import type { StaticEffect, StaticSubject } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';

type CantHaveCounters = Extract<StaticEffect, { kind: 'cantHaveCounters' }>;

/** One `cantHaveCounters` ability: whose permanent it is, who it protects and the counter it keeps off them. */
export interface CounterBlocker {
  readonly source: ObjectId;
  readonly holder: SeatId;
  readonly subject: StaticSubject;
  readonly counter: string;
}

/**
 * The `cantHaveCounters` abilities of the permanents on the battlefield as `derive` has them now. Empty in nearly every game, so a caller that puts many counters
 * reads this once and asks `blocks` for each (a cheap check of the printed abilities comes first).
 */
export function counterBlockers(state: GameState): readonly CounterBlocker[] {
  const found: CounterBlocker[] = [];  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || !mayHaveStatic(state, obj, 'cantHaveCounters')) continue;
    const holder = controllerOf(state, obj);
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind !== 'static' || ability.static.kind !== 'cantHaveCounters') continue;
      const s: CantHaveCounters = ability.static;
      found.push({ source: id, holder, subject: s.subject, counter: s.counter });
    }
  }
  return found;
}

/** Whether the ability names `target`, a permanent on the battlefield or the stand-in for one that enters. */
function names(state: GameState, blocker: CounterBlocker, target: GameObject): boolean {
  const { subject } = blocker;
  if (subject.kind === 'this') return target.id === blocker.source;
  if (subject.kind === 'attached') {
    if (state.objects[blocker.source]?.attachedTo !== target.id) return false;
    const types = derive(state, target).types;
    return (subject.types ?? []).every((t) => types.includes(t));
  }
  if (subject.kind !== 'filter') return false;
  if (subject.other === true && target.id === blocker.source) return false;
  return matchesFilter(
    state,
    target,
    { ...subject.filter, zone: 'battlefield' },
    { controller: blocker.holder, source: blocker.source },
  );
}

/** CR 122.6, 101.2: whether any of `blockers` keeps counters of the kind `counter` off `target`. */
export function blocks(
  state: GameState,
  blockers: readonly CounterBlocker[],
  target: GameObject,
  counter: string,
): boolean {
  return blockers.some((b) => b.counter === counter && names(state, b, target));
}

/** Whether a counter of the kind can't be put on `target` now: a permanent on the battlefield, or the stand-in of one that enters (read against `state`, the game without it). */
export function counterBlocked(state: GameState, target: GameObject, counter: string): boolean {
  return blocks(state, counterBlockers(state), target, counter);
}

/**
 * `counters` of a permanent that enters (`target` is the permanent as it would be on the battlefield, `state` the game without it, CR 614.12) without the kinds
 * that can't be put on it, which are dropped whole (CR 122.6). A copy of the map when nothing is dropped.
 */
export function withoutBlockedCounters(
  state: GameState,
  target: GameObject,
  counters: Readonly<Record<string, number>>,
): Record<string, number> {
  const blockers = counterBlockers(state);
  if (blockers.length === 0) return { ...counters };
  const kept: Record<string, number> = {};
  for (const [counter, n] of Object.entries(counters)) {
    if (!blocks(state, blockers, target, counter)) kept[counter] = n;
  }
  return kept;
}
