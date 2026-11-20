/**
 * The cost "Untap two tapped creatures you control" of an activated ability (CR 701.26b, 118.3, 602.2b): the player untaps `count` tapped permanents they control that
 * match. What the player may choose, the `choosePermanent` decision of purpose `untapCost` (always `forCost`) and the untapping itself.
 *
 * - CR 701.26b: only a tapped permanent can be untapped, so the candidates are the tapped permanents the player controls that match; a player with fewer than `count` cannot pay
 *   (CR 118.3, `costRefusal`).
 * - CR 601.2h: the costs are paid in the order the player likes. This one is paid after the mana (`rules/activate.ts`), so the creatures tapped for the mana of the cost are
 *   candidates, and the source's own {T} (paid first) is too when it is a permanent that matches.
 * - CR 302.6: a creature that came under the player's control this turn may be untapped, only its own {T} ability is held back by summoning sickness.
 * - CR 122.1d: a permanent with a stun counter loses a counter instead of untapping, as it does for every way a permanent untaps (`rules/untap.ts`); the cost is paid all the same.
 * - CR 118.3: with exactly as many candidates as needed the engine chooses (and says so); otherwise the player chooses and `cancel` rewinds the activation (CR 733).
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { ActivationContext, CastingContext, GameState } from '../state/types';
import { breakDown } from './activate-costs';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { collectTriggers } from './triggers';
import { untapPermanent } from './untap';
import { untapCandidates } from './untap-cost-candidates';

/** What the activation does after the permanents are untapped: the rest of the cost. */
export type AfterUntap = (state: GameState, events: GameEvent[]) => Result;

function inProgress(
  state: GameState,
): { casting: CastingContext; activation: ActivationContext } | null {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  return casting && activation ? { casting, activation } : null;
}

/** The untap cost, once the mana is paid: the engine untaps when only as many qualify as are needed, otherwise the player chooses. With no such cost it goes straight on. */
export function payUntap(state: GameState, events: GameEvent[], next: AfterUntap): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.untapPermanents === null) return next(state, events);
  const { filter, count } = costs.untapPermanents;
  const legal = untapCandidates(state, casting.seat, activation.source, filter);
  if (legal.length < count) return fail('You cannot untap enough permanents');
  if (legal.length === count) return chosen(state, events, legal, true, next);
  const paused: GameState = { ...state, casting: { ...casting, stage: 'untap' } };
  return ok(
    setPending(collectTriggers(paused, events), {
      kind: 'choosePermanent',
      seat: casting.seat,
      source: casting.object,
      purpose: 'untapCost',
      min: count,
      max: count,
      legal,
      forCost: true,
    }),
    events,
  );
}

/** Untaps the chosen permanents (CR 701.26b), after saying who chose them. */
function chosen(
  state: GameState,
  events: GameEvent[],
  objects: readonly ObjectId[],
  automatic: boolean,
  next: AfterUntap,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects,
    purpose: 'untapCost',
    automatic,
  });
  let untapped = state;
  for (const id of objects) {
    const done = untapPermanent(untapped, id);
    untapped = done.state;
    events.push(...done.events);
  }
  return next(untapped, events);
}

/** The answer to the question of an untap cost: the caller checked it against the decision's candidates and count. */
export function answerUntapPermanentsCost(
  state: GameState,
  objects: readonly ObjectId[],
  next: AfterUntap,
): Result {
  const activation = state.casting?.activation;
  if (activation == null || state.casting?.stage !== 'untap') {
    return fail('No permanents are being chosen to untap for a cost');
  }
  const costs = breakDown(activation.ability.cost, activation.x);
  if (costs === null || costs.untapPermanents === null) {
    return fail('The ability has no untap cost');
  }
  return chosen({ ...state, pending: null }, [], objects, false, next);
}
