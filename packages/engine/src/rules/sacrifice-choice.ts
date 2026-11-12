/**
 * "Sacrifice a <filter>" as an instruction of a resolving effect (CR 701.21, 608.2d). The legal set
 * is computed by the engine; the controller chooses (`choosePermanent`) unless no more candidates
 * exist than are needed.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { manaValueOfCost } from './mana-value';
import { sacrificeCandidates } from './sacrifice';
import { recordTogether } from './simultaneous';
import { done, type StepOutcome } from './step-outcome';

/** CR 701.21: the instructions that sacrifice each of `ids`. */
export function sacrificeInstructions(ids: readonly ObjectId[], seat?: SeatId): Instruction[] {
  return ids.map((object) => ({
    kind: 'sacrifice' as const,
    object,
    ...(seat === undefined ? {} : { seat }),
  }));
}

/**
 * "The greatest power among creatures they control" (D-135): of the candidates, those whose value of the stat is the largest
 * among them, as `derive` gives it now; the player chooses among the tied ones (CR 608.2d). A candidate with no such value (a
 * noncreature has no power) is left out; with none that has one nothing is left.
 */
export function greatestAmong(
  state: GameState,
  ids: readonly ObjectId[],
  stat: 'power' | 'toughness' | 'manaValue',
): ObjectId[] {
  const valued = ids.flatMap((id) => {
    const obj = state.objects[id];
    if (obj === undefined) return [];
    const d = derive(state, obj);
    const value = stat === 'manaValue' ? manaValueOfCost(d.manaCost, obj) : d[stat];
    return value === null ? [] : [{ id, value }];
  });
  const top = Math.max(...valued.map((v) => v.value));
  return valued.filter((v) => v.value === top).map((v) => v.id);
}

/**
 * CR 608.2d: "sacrifice a <filter>". With no more candidates than needed the engine chooses (and
 * says so); with none nothing happens; otherwise the controller chooses among the legal ones.
 */
export function runChooseSacrifice(
  state: GameState,
  res: ResolutionContext,
  instruction: Extract<Instruction, { kind: 'chooseSacrifice' }>,
): StepOutcome {
  // D-110: the player who sacrifices, when it is not the controller ("defending player sacrifices").
  const seat = instruction.seat ?? res.controller;
  const chosenEvent = (objects: readonly ObjectId[], automatic: boolean): GameEvent => ({
    kind: 'permanentsChosen',
    seat,
    source: res.object,
    objects,
    purpose: 'sacrifice',
    automatic,
  });
  // CR 101.4: the choice of one of several players who sacrifice together is held until the last has chosen; then all are sacrificed at once.
  const proceed = (chosen: readonly ObjectId[], events: readonly GameEvent[]): StepOutcome => {
    const group = instruction.together;
    // D-283 (CR 603.10a): what is sacrificed together is recorded before the first moves.
    if (group === undefined) {
      const together = recordTogether(state, sacrificeInstructions(chosen, instruction.seat));
      return done(together.state, events, together.instructions);
    }
    const held = [...group.held, { seat, objects: chosen }];
    const next = group.later[0];
    if (next === undefined) {
      const together = recordTogether(
        state,
        held.flatMap((h) => sacrificeInstructions(h.objects, h.seat)),
      );
      return done(together.state, events, together.instructions);
    }
    return done(state, events, [
      {
        ...instruction,
        seat: next,
        chosen: null,
        together: { later: group.later.slice(1), held },
      },
    ]);
  };
  if (instruction.chosen !== null) {
    return proceed(instruction.chosen, [chosenEvent(instruction.chosen, false)]);
  }
  const candidates = sacrificeCandidates(state, seat, res.source, instruction.filter);
  const legal =
    instruction.greatest === undefined
      ? candidates
      : greatestAmong(state, candidates, instruction.greatest);
  if (legal.length === 0) return proceed([], []);
  // D-135: "any number": the player chooses none, some or all of the candidates, even when there is only one.
  // D-187: "one or more": at least one of them.
  if (instruction.anyNumber === true) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'sacrifice',
        min: instruction.atLeastOne === true ? 1 : 0,
        max: legal.length,
        legal,
      },
    };
  }
  if (legal.length <= instruction.count) {
    return proceed(legal, [chosenEvent(legal, true)]);
  }
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat,
      source: res.object,
      purpose: 'sacrifice',
      min: instruction.count,
      max: instruction.count,
      legal,
    },
  };
}
