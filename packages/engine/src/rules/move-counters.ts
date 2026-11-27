/**
 * "Move any number of +1/+1 counters from this creature onto other creatures" (issue 230, Forgotten Ancient; CR 122.1, 122.6, 608.2d). The controller moves counters one at a time from
 * the permanent with the ability onto permanents the effect's filter matches (the source itself is never one): a `choosePermanent` decision of purpose 'moveCounters' (`min` 0, `max` 1)
 * names where the next counter goes, or none, which ends the effect. The question is asked again after each move while the source has a counter left. A permanent that can't have
 * counters of the kind (CR 122.6) is not offered. The source is the permanent of the ability: when it is gone (or has no counter) nothing is moved.
 */
import type { ObjectId } from '../ids';
import { patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { counterRemovalLocked } from './counter-lock';
import { counterBlocked } from './counter-prevention';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type MoveCounters = Extract<Instruction, { kind: 'moveCounters' }>;

/** The permanents one more counter could move onto (CR 122.1): on the battlefield, matching the filter, not the source, able to have counters of the kind. */
export function counterDestinations(
  state: GameState,
  res: ResolutionContext,
  ins: MoveCounters,
): ObjectId[] {
  return state.battlefield.filter((id) => {
    const obj = state.objects[id];
    if (obj === undefined || id === res.source) return false;
    if (!matchesFilter(state, obj, ins.to, { controller: res.controller, source: res.source })) {
      return false;
    }
    return !counterBlocked(state, obj, ins.counter);
  });
}

/** Runs `moveCounters` for the controller of the ability. */
export function runMoveCounters(
  state: GameState,
  res: ResolutionContext,
  ins: MoveCounters,
): StepOutcome {
  const source = state.objects[res.source];
  if (source === undefined || source.zone !== 'battlefield') return done(state);
  if ((source.counters[ins.counter] ?? 0) <= 0) return done(state);
  // CR 122.1d (Fear of Sleep Paralysis): a counter that can't be removed does not move.
  if (counterRemovalLocked(state, source, ins.counter)) return done(state);
  const legal = counterDestinations(state, res, ins);
  if (legal.length === 0) return done(state);
  if (ins.chosen === null) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat: controllerOf(state, source),
        source: res.object,
        purpose: 'moveCounters',
        min: 0,
        max: 1,
        legal,
      },
    };
  }
  const target = ins.chosen[0];
  // No permanent chosen: the player moves no more counters.
  if (target === undefined || !legal.includes(target)) return done(state);
  const to = state.objects[target];
  if (to === undefined) return done(state);
  let next = patchObject(state, res.source, {
    counters: { ...source.counters, [ins.counter]: (source.counters[ins.counter] ?? 0) - 1 },
  });
  next = patchObject(next, target, {
    counters: { ...to.counters, [ins.counter]: (to.counters[ins.counter] ?? 0) + 1 },
  });
  return done(
    next,
    [
      { kind: 'counterRemoved', object: res.source, counter: ins.counter, count: 1 },
      {
        kind: 'counterAdded',
        object: target,
        counter: ins.counter,
        count: 1,
        by: res.controller,
      },
    ],
    [{ ...ins, chosen: null }],
  );
}
