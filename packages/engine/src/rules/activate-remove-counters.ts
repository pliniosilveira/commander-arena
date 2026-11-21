/**
 * The cost "Remove two +1/+1 counters from among creatures you control" of an activated ability (CR 118.3, 122.1, 602.2b): the player takes `count` counters of a kind off the
 * permanents they control that match. What the player may choose, the `choosePermanent` decision of purpose `removeCountersCost` (always `forCost`), and the removal itself.
 *
 * - CR 118.3: a cost can't be paid unless the whole of it can, so a player with fewer than `count` such counters among their matching permanents can't activate (`costRefusal`).
 * - CR 122.1: the counters are taken off the permanents the player picks, one counter at a time: a permanent with two of them is asked for twice. Removing counters is not putting them,
 *   so a permanent that can't have counters put on it may still give them up.
 * - CR 118.3: with nothing to choose between (one permanent has them all, or the matching permanents hold exactly as many as are owed) the engine removes them and says so; otherwise the
 *   player chooses and `cancel` rewinds the activation (CR 733).
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { ActivationContext, CastingContext, GameState } from '../state/types';
import { breakDown } from './activate-costs';
import { removalCounters } from './remove-counters-candidates';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { collectTriggers } from './triggers';

/** What the activation does after the counters are removed: the rest of the cost. */
export type AfterRemoveCounters = (state: GameState, events: GameEvent[]) => Result;

function inProgress(
  state: GameState,
): { casting: CastingContext; activation: ActivationContext } | null {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  return casting && activation ? { casting, activation } : null;
}

/** Takes `count` counters of the kind off a permanent (it has at least that many), and says so. */
function take(
  state: GameState,
  events: GameEvent[],
  id: ObjectId,
  counter: string,
  count: number,
): GameState {
  const obj = state.objects[id];
  if (obj === undefined) return state;
  const left = (obj.counters[counter] ?? 0) - count;
  const { [counter]: _gone, ...rest } = obj.counters;
  events.push({ kind: 'counterRemoved', object: id, counter, count });
  return patchObject(state, id, {
    counters: left > 0 ? { ...obj.counters, [counter]: left } : rest,
  });
}

/** Remembers how many counters are still owed, for the next question of the same cost. */
function withLeft(state: GameState, left: number): GameState {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return state;
  return { ...state, casting: { ...casting, activation: { ...activation, countersLeft: left } } };
}

/**
 * The remove-counters cost, once the permanents to tap are paid: the engine removes the counters when there is no choice, otherwise the player is asked for one counter at a time. With no
 * such cost it goes straight on.
 */
export function payRemoveCounters(
  state: GameState,
  events: GameEvent[],
  next: AfterRemoveCounters,
): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.removeAmong === null) return next(state, events);
  const { counter, count, filter } = costs.removeAmong;
  const owed = activation.countersLeft ?? count;
  if (owed <= 0) return next(state, events);
  const { candidates, total } = removalCounters(
    state,
    casting.seat,
    activation.source,
    filter,
    counter,
  );
  if (total < owed) return fail(`You control too few ${counter} counters to remove`);
  // CR 118.3: no choice when one permanent gives them all, or when every counter there is has to come off.
  const only = candidates.length === 1 ? candidates[0] : undefined;
  if (only !== undefined || total === owed) {
    events.push({
      kind: 'permanentsChosen',
      seat: casting.seat,
      source: casting.object,
      objects: candidates,
      purpose: 'removeCountersCost',
      automatic: true,
    });
    let paid = state;
    let rest = owed;
    for (const id of candidates) {
      const here = Math.min(rest, paid.objects[id]?.counters[counter] ?? 0);
      if (here <= 0) continue;
      paid = take(paid, events, id, counter, here);
      rest -= here;
    }
    return next(withLeft(paid, 0), events);
  }
  const paused: GameState = {
    ...withLeft(state, owed),
    casting: {
      ...casting,
      stage: 'removeCounters',
      activation: { ...activation, countersLeft: owed },
    },
  };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose: 'removeCountersCost',
      min: 1,
      max: 1,
      legal: candidates,
      forCost: true,
    }),
    events,
  );
}

/** The answer to the question of a remove-counters cost: the caller checked it against the decision's candidates; one counter comes off the permanent, then the cost goes on. */
export function answerRemoveCountersCost(
  state: GameState,
  objects: readonly ObjectId[],
  next: AfterRemoveCounters,
): Result {
  const going = inProgress(state);
  if (going?.casting.stage !== 'removeCounters') {
    return fail('No permanent is being chosen to remove counters from for a cost');
  }
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.removeAmong === null) return fail('The ability has no such cost');
  const { counter, count, filter } = costs.removeAmong;
  const [id] = objects;
  const { candidates } = removalCounters(state, casting.seat, activation.source, filter, counter);
  if (id === undefined || !candidates.includes(id)) {
    return fail('That permanent has no such counter to remove');
  }
  const events: GameEvent[] = [
    {
      kind: 'permanentsChosen',
      seat: casting.seat,
      source: casting.object,
      objects,
      purpose: 'removeCountersCost',
      automatic: false,
    },
  ];
  const owed = activation.countersLeft ?? count;
  const paid = take({ ...state, pending: null }, events, id, counter, 1);
  return payRemoveCounters(withLeft(paid, owed - 1), events, next);
}
