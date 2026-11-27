/**
 * The cost "Return an artifact you control to its owner's hand" of an activated ability (D-139, CR 118.3): what the player may return,
 * the `choosePermanent` decision of purpose `bounce` (always `forCost`), and the return itself, one permanent after another. It is
 * paid after the sacrifice and before the discard (`rules/activate.ts`), which this file leaves to a continuation it is given.
 *
 * Each permanent goes to its owner's hand (CR 108.3); a token ceases to exist there (CR 111.7, 704.5d). A commander's owner may put
 * it into the command zone instead (CR 903.9b): the question is asked in the middle of the activation, after the player chose, and the
 * answer goes on with the rest of the cost (`answerBounceCommander`); there is no cancel for that question, as for every question the
 * moves of a cost can raise.
 *
 * The cost "Exile a face-down permanent you control face up" (Primordial Mist, CR 118.3, 406.3, 708.9) is paid the same way with the exile as the destination: the permanent goes to
 * exile face up (a face-down one is revealed as it moves; a token ceases to exist), the question has the purpose `exileCost`, and the cards the permanents become in exile are written
 * on the ability on the stack as `StackData.movedBefore`, which `moved` names in its effect (CR 400.7: "that card").
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
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

/** Writes what the attacker `id` is attacking on the ability `ability` that is being paid for (`StackData.returnedAttack`), when it is attacking. */
function rememberAttack(state: GameState, ability: ObjectId, id: ObjectId): GameState {
  const entry = state.combat?.attackers.find((a) => a.object === id);
  const stack = state.objects[ability]?.stack;
  if (entry === undefined || stack == null) return state;
  return patchObject(state, ability, {
    stack: {
      ...stack,
      returnedAttack: {
        target: entry.target,
        ...(entry.defender === undefined ? {} : { defender: entry.defender }),
        ...(entry.targetGone === true ? { targetGone: true as const } : {}),
      },
    },
  });
}

/** Writes the cards the cost exiled on the ability that is being paid for (`StackData.movedBefore`), for `moved` in its effect. */
function rememberExiled(
  state: GameState,
  ability: ObjectId,
  exiled: readonly ObjectId[],
): GameState {
  const stack = state.objects[ability]?.stack;
  if (stack == null) return state;
  return patchObject(state, ability, { stack: { ...stack, movedBefore: [...exiled] } });
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
  const { casting, activation } = going;
  // CR 401.4: "put this creature on the bottom of its owner's library" (`returnToHand.toLibraryBottom`).
  const parts = breakDown(activation.ability.cost, activation.x);
  const toBottom = parts?.bounceToLibraryBottom === true;
  const toExile = parts?.bounceToExile === true;
  let current = state;
  const exiled: ObjectId[] = [];
  let choice = answer;
  for (const [i, id] of queue.entries()) {
    const obj = current.objects[id];
    if (obj?.zone !== 'battlefield' || controllerOf(state, obj) !== casting.seat) {
      return fail("That permanent cannot be returned to its owner's hand");
    }
    // CR 702.49a (Ninjutsu, unverified): what the returned attacker was attacking is written on the ability before it leaves combat, for `enterAttacking.asReturned`.
    current = rememberAttack(current, casting.object, id);
    const moved = moveObject(
      current,
      toExile
        ? { object: id, to: 'exile', commanderChoice: choice }
        : toBottom
          ? { object: id, to: 'library', position: 'bottom', commanderChoice: choice }
          : { object: id, to: 'hand', commanderChoice: choice },
    );
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
    if (toExile && moved.newObject !== null) exiled.push(moved.newObject);
  }
  const { bounce: _done, ...rest } = current.casting ?? casting;
  if (toExile) current = rememberExiled(current, casting.object, exiled);
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
  const purpose = costs.bounceToExile ? 'exileCost' : 'bounce';
  if (costs.bounce === 'this') {
    return chosen(state, events, [activation.source], true, next, purpose);
  }
  const legal = controlledCandidates(state, casting.seat, activation.source, costs.bounce);
  if (legal.length < costs.bounceCount) {
    return fail("You do not control enough permanents to return to their owners' hands");
  }
  if (legal.length === costs.bounceCount) {
    return chosen(state, events, legal, true, next, purpose);
  }
  const paused: GameState = { ...state, casting: { ...casting, stage: 'bounce' } };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose,
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
  purpose: 'bounce' | 'exileCost',
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects,
    purpose,
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
  const exile = breakDown(
    state.casting.activation.ability.cost,
    state.casting.activation.x,
  )?.bounceToExile;
  return chosen(
    { ...state, pending: null },
    [],
    objects,
    false,
    next,
    exile === true ? 'exileCost' : 'bounce',
  );
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
