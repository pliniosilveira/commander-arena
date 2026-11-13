/**
 * The cost "Blight 1" of an activated ability (D-407, CR 701.68): the player puts N -1/-1 counters on a creature they control. What the player may
 * choose, the `choosePermanent` decision of purpose `blight` (always `forCost`) and the counters themselves. It is paid after the permanents to tap and
 * before the sacrifice (`rules/activate.ts`), which this file leaves to a continuation it is given.
 *
 * - CR 701.68a: "to blight N" means to put N -1/-1 counters on a creature you control; the player chooses the creature.
 * - CR 701.68b: a player who is unable to put the counters on any creature they control can't choose to blight, so the ability can't be activated (`costRefusal`
 *   asks `blightCandidates`). A creature that can't have -1/-1 counters put on it (CR 122.6, 101.2: `cantHaveCounters`) is no candidate.
 * - CR 118.3: with exactly one candidate the engine chooses (and says so); otherwise the player chooses and `cancel` rewinds the activation (CR 733).
 * - CR 701.68d: an ability that triggers whenever a player blights is not run yet (`docs/ROADMAP.md`).
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { ActivationContext, CastingContext, GameState } from '../state/types';
import { breakDown } from './activate-costs';
import { BLIGHT_COUNTER, blightCandidates } from './blight-candidates';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { collectTriggers } from './triggers';

/** What the activation does after the counters are put on the creature: the sacrifice cost, or the rest of the cost. */
export type AfterBlight = (state: GameState, events: GameEvent[]) => Result;

function inProgress(
  state: GameState,
): { casting: CastingContext; activation: ActivationContext } | null {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  return casting && activation ? { casting, activation } : null;
}

/**
 * The blight cost, once the permanents to tap are paid: the creature is chosen by the player (with exactly one candidate the engine chooses it) and
 * gets the counters. With no such cost it goes straight on.
 */
export function payBlight(state: GameState, events: GameEvent[], next: AfterBlight): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.blight === 0) return next(state, events);
  const legal = blightCandidates(state, casting.seat);
  if (legal.length === 0) return fail('You control no creature to put -1/-1 counters on');
  if (legal.length === 1) return chosen(state, events, legal, costs.blight, true, next);
  const paused: GameState = { ...state, casting: { ...casting, stage: 'blight' } };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose: 'blight',
      min: 1,
      max: 1,
      legal,
      forCost: true,
    }),
    events,
  );
}

/** Puts the counters on the creature (CR 701.68a), after saying who chose it. */
function chosen(
  state: GameState,
  events: GameEvent[],
  objects: readonly ObjectId[],
  count: number,
  automatic: boolean,
  next: AfterBlight,
): Result {
  const casting = state.casting;
  const [id] = objects;
  const creature = id === undefined ? undefined : state.objects[id];
  if (!casting || id === undefined || creature === undefined) {
    return fail('That creature cannot be blighted');
  }
  if (!blightCandidates(state, casting.seat).includes(id)) {
    return fail('That creature cannot be blighted');
  }
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects,
    purpose: 'blight',
    automatic,
  });
  events.push({
    kind: 'counterAdded',
    object: id,
    counter: BLIGHT_COUNTER,
    count,
    by: casting.seat,
  });
  const blighted = patchObject(state, id, {
    counters: {
      ...creature.counters,
      [BLIGHT_COUNTER]: (creature.counters[BLIGHT_COUNTER] ?? 0) + count,
    },
  });
  return next(blighted, events);
}

/** The answer to the question of a blight cost: the caller checked it against the decision's candidates and count. */
export function answerBlightCost(
  state: GameState,
  objects: readonly ObjectId[],
  next: AfterBlight,
): Result {
  const activation = state.casting?.activation;
  if (activation == null || state.casting?.stage !== 'blight') {
    return fail('No creature is being chosen to blight for a cost');
  }
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.blight === 0) return fail('The ability has no blight cost');
  return chosen({ ...state, pending: null }, [], objects, costs.blight, false, next);
}
