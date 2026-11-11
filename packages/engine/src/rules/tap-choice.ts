/**
 * "You may tap X untapped Myr you control" and "tap two untapped creatures you control" as instructions of a resolving effect
 * (CR 701.26a, 608.2d, D-139). The controller chooses among the untapped permanents they control that match, with a
 * `choosePermanent` decision, unless no more qualify than are needed; the chosen are tapped (summoning sickness does not matter,
 * CR 302.6). What was tapped is remembered for the `thisWay` `tapped` amount and `didPrevious` ("if you do").
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { objectsInZone, patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { tapCandidates } from './sacrifice';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';
import { untapPermanent } from './untap';

type ChooseTapInstruction = Extract<Instruction, { kind: 'chooseTap' }>;

/** Taps the chosen permanents that are still untapped on the battlefield; what was tapped is what the outcome reports. */
function tapAll(state: GameState, objects: readonly ObjectId[]): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let tapped = 0;
  for (const id of objects) {
    const obj = next.objects[id];
    if (obj?.zone !== 'battlefield' || obj.tapped) continue;
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id });
    tapped += 1;
  }
  return { ...done(next, events), thisWay: { tapped }, performed: tapped };
}

/**
 * The tapped permanents on the battlefield the filter matches, whoever controls them (D-216, CR 701.26a: "Untap up to three lands" is not
 * "you control", and it names no target).
 */
export function untapCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ChooseTapInstruction['filter'],
): ObjectId[] {
  const scoped = { ...filter, zone: 'battlefield' as const, tapped: true };
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return obj !== undefined && matchesFilter(state, obj, scoped, { controller: seat, source });
  });
}

/** Untaps the chosen permanents that are still tapped on the battlefield; what was untapped is what the outcome reports (CR 122.1d: stun counters). */
function untapAll(state: GameState, objects: readonly ObjectId[]): StepOutcome {
  let next = state;
  const events: GameEvent[] = [];
  let untapped = 0;
  for (const id of objects) {
    const obj = next.objects[id];
    if (obj?.zone !== 'battlefield' || !obj.tapped) continue;
    const r = untapPermanent(next, id);
    next = r.state;
    events.push(...r.events);
    untapped += 1;
  }
  return { ...done(next, events), performed: untapped };
}

export function runChooseTap(
  state: GameState,
  res: ResolutionContext,
  instruction: ChooseTapInstruction,
): StepOutcome {
  const chosenEvent = (objects: readonly ObjectId[], automatic: boolean): GameEvent => ({
    kind: 'permanentsChosen',
    seat: res.controller,
    source: res.object,
    objects,
    purpose: 'effect',
    automatic,
  });
  if (instruction.untap === true) {
    if (instruction.chosen !== null) {
      const r = untapAll(state, instruction.chosen);
      return { ...r, events: [chosenEvent(instruction.chosen, false), ...r.events] };
    }
    const legal = untapCandidates(state, res.controller, res.source, instruction.filter);
    if (legal.length === 0) return done(state);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat: res.controller,
        source: res.object,
        purpose: 'untapChoice',
        min: 0,
        max: Math.min(instruction.count, legal.length),
        legal,
      },
    };
  }
  if (instruction.chosen !== null) {
    const r = tapAll(state, instruction.chosen);
    return { ...r, events: [chosenEvent(instruction.chosen, false), ...r.events] };
  }
  const legal = tapCandidates(state, res.controller, res.source, instruction.filter);
  if (legal.length === 0) return done(state);
  if (instruction.anyNumber !== true && legal.length <= instruction.count) {
    const r = tapAll(state, legal);
    return { ...r, events: [chosenEvent(legal, true), ...r.events] };
  }
  const max = instruction.anyNumber === true ? legal.length : instruction.count;
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: res.controller,
      source: res.object,
      purpose: 'effect',
      min: instruction.anyNumber === true ? 0 : max,
      max,
      legal,
    },
  };
}
