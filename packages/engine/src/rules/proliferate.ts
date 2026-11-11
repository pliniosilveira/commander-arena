/**
 * "Proliferate" (CR 701.34a, D-149): the controller of the resolving spell or ability chooses any number of permanents and/or players that
 * have a counter, then gives each chosen one additional counter of each kind it already has. The permanents are every permanent on the
 * battlefield with a counter, whoever controls it; the players are those with poison counters (the only counters the engine keeps on a
 * player). They are chosen with a `choosePermanent` decision of purpose `proliferate` (the answer may be empty); with nothing that has
 * a counter nobody is asked and nothing happens. The counters are put by the controller (CR 122.6, 122.6a), so "whenever you put one or
 * more +1/+1 counters" counts them, and a Saga given a lore counter reaches its next chapter (CR 714.2b).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchObject, patchSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { done, type StepOutcome } from './step-outcome';

type ProliferateInstruction = Extract<Instruction, { kind: 'proliferate' }>;

/** Whether the counters of an object include one of any kind. */
function hasCounter(counters: Readonly<Record<string, number>>): boolean {
  return Object.values(counters).some((n) => n > 0);
}

/** The permanents on the battlefield that have a counter, oldest first, and the players who have poison counters. */
export function proliferateCandidates(state: GameState): {
  readonly permanents: readonly ObjectId[];
  readonly players: readonly SeatId[];
} {
  return {
    permanents: state.battlefield.filter((id) => {
      const obj = state.objects[id];
      return obj !== undefined && hasCounter(obj.counters);
    }),
    players: state.seats.filter((s) => !s.hasLost && s.poison > 0).map((s) => s.id),
  };
}

export function runProliferate(
  state: GameState,
  res: ResolutionContext,
  instruction: ProliferateInstruction,
): StepOutcome {
  if (instruction.chosen === null) {
    const { permanents, players } = proliferateCandidates(state);
    if (permanents.length === 0 && players.length === 0) return done(state);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat: res.controller,
        source: res.object,
        purpose: 'proliferate',
        min: 0,
        max: permanents.length,
        legal: permanents,
        players,
      },
    };
  }
  let next = state;
  const events: GameEvent[] = [];
  const given: ObjectId[] = [];
  for (const id of instruction.chosen) {
    const obj = next.objects[id];
    // A permanent that left the battlefield or lost its counters while the choice was made is not given any (CR 701.34a).
    if (obj === undefined || obj.zone !== 'battlefield' || !hasCounter(obj.counters)) continue;
    const counters = { ...obj.counters };
    for (const [counter, n] of Object.entries(obj.counters)) {
      if (n <= 0) continue;
      counters[counter] = n + 1;
      events.push({ kind: 'counterAdded', object: id, counter, count: 1, by: res.controller });
    }
    next = patchObject(next, id, { counters });
    given.push(id);
  }
  const poisoned: SeatId[] = [];
  for (const seat of instruction.players) {
    const s = getSeat(next, seat);
    if (s.hasLost || s.poison <= 0) continue;
    next = patchSeat(next, seat, { poison: s.poison + 1 });
    events.push({ kind: 'poisonChanged', seat, from: s.poison, to: s.poison + 1 });
    poisoned.push(seat);
  }
  events.unshift({
    kind: 'proliferated',
    seat: res.controller,
    source: res.object,
    objects: given,
    players: poisoned,
  });
  return done(next, events);
}
