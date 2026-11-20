/**
 * "Blight N" outside the cost of an activated ability (CR 701.68a Blight): the player puts N -1/-1 counters on a creature they control. This file holds the
 * counters themselves (`putBlightCounters`, shared by the instruction, Ward's cost and a spell's optional additional cost) and the instruction `blight` of a
 * resolving spell or ability ("draw a card and blight 1").
 *
 * - CR 701.68a: the player chooses the creature (a `choosePermanent` decision of purpose `blight`, not `forCost`; with one candidate the engine chooses and says so).
 * - CR 701.68b: a player who can't put the counters on any creature they control can't blight, so the instruction does nothing (`blightCandidates`).
 * - CR 614.1a, 122.6: the counters are put on as any effect puts them, so a replacement effect of counters put on a permanent applies and a creature that can't have
 *   -1/-1 counters is not a candidate.
 * - CR 701.68d: an ability that triggers whenever a player blights is not run yet (`docs/ROADMAP.md`).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { BLIGHT_COUNTER, blightCandidates } from './blight-candidates';
import { bonusCounters, counterBonuses } from './counter-bonus';
import { done, type StepOutcome } from './step-outcome';

type Blight = Extract<Instruction, { kind: 'blight' }>;

/** CR 701.68a: `count` -1/-1 counters on the creature `id` (a replacement effect may add some, CR 614.1a), put by the player `by`; no change when it is gone. */
export function putBlightCounters(
  state: GameState,
  id: ObjectId,
  count: number,
  by: SeatId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const creature = state.objects[id];
  if (creature === undefined || creature.zone !== 'battlefield') return { state, events: [] };
  const put = bonusCounters(state, counterBonuses(state), creature, BLIGHT_COUNTER, count);
  return {
    state: patchObject(state, id, {
      counters: {
        ...creature.counters,
        [BLIGHT_COUNTER]: (creature.counters[BLIGHT_COUNTER] ?? 0) + put,
      },
    }),
    events: [{ kind: 'counterAdded', object: id, counter: BLIGHT_COUNTER, count: put, by }],
  };
}

/** The event that says which creature a player chose to blight. */
export function blightChosenEvent(
  seat: SeatId,
  source: ObjectId,
  objects: readonly ObjectId[],
  automatic: boolean,
): GameEvent {
  return { kind: 'permanentsChosen', seat, source, objects, purpose: 'blight', automatic };
}

/** Runs the instruction `blight` for the controller of the spell or ability (CR 701.68a, 701.68b). */
export function runBlight(state: GameState, res: ResolutionContext, ins: Blight): StepOutcome {
  const seat = res.controller;
  let chosen = ins.chosen;
  let automatic = false;
  if (chosen === null) {
    const legal = blightCandidates(state, seat);
    // CR 701.68b: with no creature that can take the counters the player can't blight.
    if (legal.length === 0) return done(state);
    if (legal.length > 1) {
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'choosePermanent',
          seat,
          source: res.object,
          purpose: 'blight',
          min: 1,
          max: 1,
          legal,
        },
      };
    }
    chosen = legal;
    automatic = true;
  }
  const [id] = chosen;
  // The creature chosen is no longer a legal choice (it left or can't take the counters now): nothing happens (CR 608.2b).
  if (id === undefined || !blightCandidates(state, seat).includes(id)) return done(state);
  const put = putBlightCounters(state, id, ins.count, seat);
  return {
    ...done(put.state, [blightChosenEvent(seat, res.object, [id], automatic), ...put.events]),
    performed: 1,
  };
}
