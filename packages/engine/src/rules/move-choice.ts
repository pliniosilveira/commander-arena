/**
 * "Return a land you control to its owner's hand" and "You may put an artifact card from your hand onto the battlefield" as
 * instructions of a resolving effect (CR 608.2d): the controller chooses among the permanents they control that match, or (D-139)
 * among the cards they own in their hand or graveyard, with a `choosePermanent` or a `chooseCards` decision, unless no more
 * qualify than are needed. The choice then runs as ordinary move instructions, so a commander asks its owner (CR 903.9b) like any
 * other move to the hand or library.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { zoneList } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { moveInstructions } from './effect-support';
import { controlledCandidates } from './sacrifice';
import { matchesFilter } from './select';
import { recordTogether } from './simultaneous';
import { done, type StepOutcome } from './step-outcome';

type ChooseMoveInstruction = Extract<Instruction, { kind: 'chooseMove' }>;

/** A choice among the cards the player owns in their hand or graveyard (D-139), not among their permanents. */
export function isCardZoneChoice(filter: ObjectFilter): boolean {
  return filter.zone === 'hand' || filter.zone === 'graveyard' || filter.zone === 'exile';
}

/** The cards `seat` owns in the zone the filter names that match it (`source` is what "another" excludes). */
function cardCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
): ObjectId[] {
  // CR 607.2a (D-207): "a card exiled with this artifact": the cards the permanent exiled with its linked ability that are still in exile.
  if (filter.zone === 'exile') {
    const { controller: _you, ...described } = filter;
    const linked = source === null ? [] : (state.objects[source]?.linkedExile ?? []);
    return linked.filter((id) => {
      const obj = state.objects[id];
      return (
        obj?.zone === 'exile' &&
        matchesFilter(state, obj, { ...described, zone: 'exile' }, { controller: seat, source })
      );
    });
  }
  const zone = filter.zone === 'graveyard' ? 'graveyard' : 'hand';
  // The zone belongs to the player ("your hand"), so whose the card is does not need saying again.
  const { controller: _you, ...described } = filter;
  return zoneList(state, zone, seat).filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      matchesFilter(state, obj, { ...described, zone }, { controller: seat, source })
    );
  });
}

const WHERE: Readonly<Record<ChooseMoveInstruction['to'], string>> = {
  exile: 'into exile',
  hand: 'into your hand',
  graveyard: 'into your graveyard',
  library: 'into your library',
  battlefield: 'onto the battlefield',
};

/**
 * With no candidate nothing happens; with no more candidates than needed the engine chooses (and says so); otherwise the
 * controller chooses among them (a "may" choice always asks when there is a candidate). What moved is what a later `moved`
 * reference means (CR 400.7j), so `lastMoved` starts empty.
 */
export function runChooseMove(
  state: GameState,
  res: ResolutionContext,
  instruction: ChooseMoveInstruction,
): StepOutcome {
  // D-231: "each player exiles a card from their graveyard": the player the instruction names chooses among their own cards.
  const chooser = instruction.seat ?? res.controller;
  const run = (objects: readonly ObjectId[], automatic: boolean): StepOutcome => {
    const event: GameEvent = {
      kind: 'permanentsChosen',
      seat: chooser,
      source: res.object,
      objects,
      purpose: 'effect',
      automatic,
    };
    // D-283 (CR 603.10a): permanents put into a graveyard (or elsewhere) together keep the last-known information recorded before the first leaves.
    const together = recordTogether(
      state,
      moveInstructions(
        objects,
        instruction.to,
        instruction.position,
        instruction.tapped ?? false,
        instruction.controller,
        instruction.withCounters,
      ).map((i) =>
        i.kind === 'move' && instruction.countsNonland === true
          ? { ...i, countsNonland: true as const }
          : i,
      ),
    );
    return { ...done(together.state, [event], together.instructions), lastMoved: [] };
  };
  if (instruction.chosen !== null) return run(instruction.chosen, false);
  const fromCards = isCardZoneChoice(instruction.filter);
  const legal = fromCards
    ? cardCandidates(state, chooser, res.source, instruction.filter)
    : controlledCandidates(state, chooser, res.source, instruction.filter);
  if (legal.length === 0) return { ...done(state), lastMoved: [] };
  const optional = instruction.optional === true;
  if (!optional && legal.length <= instruction.count) return run(legal, true);
  const max = Math.min(instruction.count, legal.length);
  const min = optional ? 0 : max;
  if (fromCards) {
    const zone =
      instruction.filter.zone === 'graveyard'
        ? 'graveyard'
        : instruction.filter.zone === 'exile'
          ? 'exile'
          : 'hand';
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: chooser,
        source: res.object,
        purpose: 'move',
        zone,
        legal,
        min,
        max,
        reveal: zone !== 'hand',
        prompt: `Choose ${optional ? 'up to ' : ''}${max} card${max === 1 ? '' : 's'} ${zone === 'exile' ? 'exiled with this permanent' : `from your ${zone}`} to put ${WHERE[instruction.to]}`,
      },
    };
  }
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: chooser,
      source: res.object,
      purpose: 'effect',
      min,
      max,
      legal,
    },
  };
}
