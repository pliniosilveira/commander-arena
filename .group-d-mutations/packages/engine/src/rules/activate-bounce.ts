/**
 * The cost "Return an artifact you control to its owner's hand" of an activated ability (D-139, CR 118.3): what the player may return,
 * the `choosePermanent` decision of purpose `bounce` (always `forCost`), and the return itself, one permanent after another. It is
 * paid after the sacrifice and before the discard (`rules/activate.ts`), which this file leaves to a continuation it is given.
 *
 * Each permanent goes to its owner's hand (CR 108.3); a token ceases to exist there (CR 111.7, 704.5d). A commander's owner may put
 * it into the command zone instead (CR 903.9b): the question is asked in the middle of the activation, after the player chose, and the
 * answer goes on with the rest of the cost (`answerBounceCommander`); there is no cancel for that question, as for every question the
 * moves of a cost can raise.
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { ActivationContext, CastingContext, GameState } from '../state/types';
import { breakDown } from './activate-costs';
import { controllerOf } from './control';
import { fail, ok, type Result } from './result';
import { controlledCandidates } from './sacrifice';
import { setPending } from './set-pending';
import { collectTriggers } from './triggers';
import { moveObject } from './zones';

/** What the activation does after the permanents are returned: the discard cost, or the end of the activation. */
export type AfterBounce = (state: GameState, events: GameEvent[]) => Result;

function inProgress(
  state: GameState,
): { casting: CastingContext; activation: ActivationContext } | null {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  return casting && activation ? { casting, activation } : null;
}

/**
 * Moves `queue` to the owners' hands in order. A commander in it asks its owner first (CR 903.9b): the activation stops with that
 * question, the permanents still to return kept in `CastingContext.bounce`.
 */
function returnAll(
  state: GameState,
  events: GameEvent[],
  queue: readonly ObjectId[],
  answer: boolean | null,
  next: AfterBounce,
): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting } = going;
  let current = state;
  let choice = answer;
  for (const [i, id] of queue.entries()) {
    const obj = current.objects[id];
    if (obj?.zone !== 'battlefield' || controllerOf(state, obj) !== casting.seat) {
      return fail("That permanent cannot be returned to its owner's hand");
    }
    const moved = moveObject(current, { object: id, to: 'hand', commanderChoice: choice });
    choice = null;
    if (moved.kind === 'needsDecision') {
      const paused: GameState = {
        ...current,
        casting: { ...casting, stage: 'bounce', bounce: { queue: queue.slice(i) } },
      };
      return ok(setPending(collectTriggers(paused, events), moved.decision), events);
    }
    current = moved.state;
    events.push(...moved.events);
  }
  const { bounce: _done, ...rest } = current.casting ?? casting;
  return next({ ...current, casting: rest }, events);
}

/**
 * The return cost, once the sacrifice is paid: "this" is returned at once; a choice among the permanents the player controls is made
 * by them (with exactly as many candidates as needed the engine returns them all). With no such cost it goes straight on.
 */
export function payBounce(state: GameState, events: GameEvent[], next: AfterBounce): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.bounce === null) return next(state, events);
  if (costs.bounce === 'this') {
    return chosen(state, events, [activation.source], true, next);
  }
  const legal = controlledCandidates(state, casting.seat, activation.source, costs.bounce);
  if (legal.length < costs.bounceCount) {
    return fail("You do not control enough permanents to return to their owners' hands");
  }
  if (legal.length === costs.bounceCount) return chosen(state, events, legal, true, next);
  const paused: GameState = { ...state, casting: { ...casting, stage: 'bounce' } };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose: 'bounce',
      min: costs.bounceCount,
      max: costs.bounceCount,
      legal,
      forCost: true,
    }),
    events,
  );
}

function chosen(
  state: GameState,
  events: GameEvent[],
  objects: readonly ObjectId[],
  automatic: boolean,
  next: AfterBounce,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects,
    purpose: 'bounce',
    automatic,
  });
  return returnAll(state, events, objects, null, next);
}

/** The answer to the question of a return cost: the caller checked it against the decision's candidates and count. */
export function answerBounceCost(
  state: GameState,
  objects: readonly ObjectId[],
  next: AfterBounce,
): Result {
  if (state.casting?.activation == null || state.casting.stage !== 'bounce') {
    return fail('No permanents are being chosen to return for a cost');
  }
  return chosen({ ...state, pending: null }, [], objects, false, next);
}

/**
 * The owner's answer to CR 903.9b for a commander the cost returns (command zone, or its owner's hand): the first of the permanents
 * still to return is that commander; the rest follow.
 */
export function answerBounceCommander(
  state: GameState,
  object: ObjectId,
  toCommandZone: boolean,
  next: AfterBounce,
): Result | null {
  const queue = state.casting?.bounce?.queue;
  if (queue === undefined || queue[0] !== object || state.casting?.activation == null) return null;
  return returnAll({ ...state, pending: null }, [], queue, toCommandZone, next);
}
