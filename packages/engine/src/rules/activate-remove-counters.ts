/**
 * The costs that remove counters, other than "Remove a +1/+1 counter from this permanent" (CR 118.3, 122.1, 602.2b):
 *
 * - "Remove two +1/+1 counters from among creatures you control" (a kind of counter, `among`): the player takes `count` counters of a kind off the permanents they control that match.
 *   What the player may choose, the `choosePermanent` decision of purpose `removeCountersCost` (always `forCost`), and the removal itself.
 * - "Remove a counter from this Equipment", "Remove three counters from among other artifacts, creatures, and planeswalkers you control" (no kind named), "Remove X counters from an
 *   artifact or creature you control" (X, all from one permanent): the player picks the counters one at a time, a `chooseOption` decision of purpose `counterPick` and `forCost` that
 *   lists every counter that may come off next (the permanent and the kind, `counterPicks`).
 *
 * - CR 118.3: a cost can't be paid unless the whole of it can, so a player with fewer than `count` such counters among their matching permanents can't activate (`costRefusal`).
 * - CR 122.1: the counters are taken off the permanents the player picks, one counter at a time: a permanent with two of them is asked for twice. Removing counters is not putting them,
 *   so a permanent that can't have counters put on it may still give them up.
 * - CR 118.3: with nothing to choose between (one permanent has them all, or the matching permanents hold exactly as many as are owed, or one permanent holds one kind of counter) the engine
 *   removes them and says so; otherwise the player chooses and `cancel` rewinds the activation (CR 733).
 * - CR 107.3a, 602.2b: with `countX` the number of counters is the X announced for the ability; X = 0 removes none and asks nothing.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { ActivationContext, CastingContext, GameState } from '../state/types';
import { breakDown } from './activate-costs';
import { counterPickLabels } from './counter-pick';
import { removalCounters } from './remove-counters-candidates';
import { picksPermanents, removalPicks } from './remove-counters-spec';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { sourceInfo } from './source-info';
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
function withLeft(state: GameState, left: number, from?: ObjectId): GameState {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return state;
  return {
    ...state,
    casting: {
      ...casting,
      activation: {
        ...activation,
        countersLeft: left,
        ...(from === undefined ? {} : { removedFrom: from }),
      },
    },
  };
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
  const spec = costs.removeAmong;
  const owed = activation.countersLeft ?? spec.count;
  if (owed <= 0) return next(state, events);
  if (picksPermanents(spec) && spec.filter !== null && spec.counter !== undefined) {
    return payFromPermanents(state, events, next, spec.filter, spec.counter, owed);
  }
  const { picks, total } = removalPicks(
    state,
    casting.seat,
    activation.source,
    spec,
    owed,
    activation.removedFrom,
  );
  if (total < owed) return fail('You control too few counters to remove');
  // CR 118.3: no choice when every counter there is has to come off, or when one kind on one permanent is all there is to take.
  const only = picks.length === 1 ? picks[0] : undefined;
  if (only !== undefined || total === owed) {
    events.push({
      kind: 'permanentsChosen',
      seat: casting.seat,
      source: casting.object,
      objects: [...new Set(picks.map((p) => p.object))],
      purpose: 'removeCountersCost',
      automatic: true,
    });
    let paid = state;
    let rest = owed;
    for (const pick of picks) {
      const here = Math.min(rest, paid.objects[pick.object]?.counters[pick.counter] ?? 0);
      if (here <= 0) continue;
      paid = take(paid, events, pick.object, pick.counter, here);
      rest -= here;
    }
    return next(withLeft(paid, 0), events);
  }
  const labels = counterPickLabels(state, casting.seat, picks);
  const info = sourceInfo(state, casting.object);
  const paused: GameState = {
    ...withLeft(state, owed, activation.removedFrom),
    casting: {
      ...casting,
      stage: 'removeCounters',
      activation: {
        ...activation,
        countersLeft: owed,
        ...(activation.removedFrom === undefined ? {} : { removedFrom: activation.removedFrom }),
      },
    },
  };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'chooseOption',
      seat: casting.seat,
      purpose: 'counterPick',
      options: labels,
      counterPicks: picks,
      source: casting.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
      forCost: true,
    }),
    events,
  );
}

/** The older reading: the player chooses the permanent each counter of the named kind comes off. */
function payFromPermanents(
  state: GameState,
  events: GameEvent[],
  next: AfterRemoveCounters,
  filter: ObjectFilter,
  counter: string,
  owed: number,
): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
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
  if (counter === undefined || filter === null) return fail('The ability has no such cost');
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

/**
 * The answer to the question of a remove-counters cost that lists the counters (`counterPick`, `forCost`): the option the player picked names the permanent and the kind; one counter
 * comes off it, then the cost goes on. With `fromOne` the permanent the first counter came off is the one every other comes off.
 */
export function answerRemoveCountersPick(
  state: GameState,
  option: string,
  next: AfterRemoveCounters,
): Result {
  const going = inProgress(state);
  if (going?.casting.stage !== 'removeCounters') {
    return fail('No counter is being chosen to remove for a cost');
  }
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.removeAmong === null) return fail('The ability has no such cost');
  const spec = costs.removeAmong;
  const owed = activation.countersLeft ?? spec.count;
  const { picks } = removalPicks(
    state,
    casting.seat,
    activation.source,
    spec,
    owed,
    activation.removedFrom,
  );
  const labels = counterPickLabels(state, casting.seat, picks);
  const pick = picks[labels.indexOf(option)];
  if (pick === undefined) return fail('That is not one of the options');
  const events: GameEvent[] = [
    {
      kind: 'permanentsChosen',
      seat: casting.seat,
      source: casting.object,
      objects: [pick.object],
      purpose: 'removeCountersCost',
      automatic: false,
    },
  ];
  const paid = take({ ...state, pending: null }, events, pick.object, pick.counter, 1);
  return payRemoveCounters(
    withLeft(paid, owed - 1, spec.fromOne ? pick.object : undefined),
    events,
    next,
  );
}
