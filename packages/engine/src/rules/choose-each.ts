/**
 * "Starting with you, each player may choose an artifact or enchantment you don't control. Destroy each permanent chosen this way." (`eachPlayerChoosesDestroy`, Druid of Purification,
 * issue 105; CR 101.4, 608.2d, 701.8). Every player still in the game, in turn order starting with the controller of the effect, is asked in turn (a `choosePermanent` decision of purpose
 * 'effect', none allowed) which permanent the filter matches they choose, nothing being asked of a player with no candidate; the question is asked again for the next player once an
 * answer is in. When the last has chosen every permanent chosen is destroyed together (`destroy` of the objects `moved` names).
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId } from '../ids';
import { objectsInZone } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type ChooseEachInstruction = Extract<Instruction, { kind: 'chooseEach' }>;

/** The permanents on the battlefield the filter matches, read from the controller of the effect: what any player may choose (CR 608.2d). */
export function chooseEachCandidates(
  state: GameState,
  res: ResolutionContext,
  filter: ObjectFilter,
): ObjectId[] {
  const scoped = { ...filter, zone: 'battlefield' as const };
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      matchesFilter(state, obj, scoped, { controller: res.controller, source: res.source })
    );
  });
}

/** Every permanent chosen is destroyed together: the objects `moved` names, which the instruction sets to the choices. */
function finish(state: GameState, picked: readonly ObjectId[]): StepOutcome {
  if (picked.length === 0) return done(state);
  return {
    ...done(
      state,
      [],
      [{ kind: 'effect', effect: { kind: 'destroy', objects: { kind: 'moved' } } }],
    ),
    lastMoved: picked,
  };
}

export function runChooseEach(
  state: GameState,
  res: ResolutionContext,
  ins: ChooseEachInstruction,
): StepOutcome {
  // An answer is in: it joins the choices (a permanent chosen twice counts once), and the next player is asked.
  if (ins.chosen !== null) {
    const picked = [...ins.picked, ...ins.chosen.filter((id) => !ins.picked.includes(id))];
    return done(state, [], [{ ...ins, seats: ins.seats.slice(1), picked, chosen: null }]);
  }
  const [asked] = ins.seats;
  const legal = chooseEachCandidates(state, res, ins.filter);
  // Nobody is left to ask, or there is nothing to choose: what was chosen is destroyed.
  if (asked === undefined || legal.length === 0) return finish(state, ins.picked);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: asked,
      source: res.object,
      purpose: 'effect',
      min: 0,
      max: 1,
      legal,
    },
  };
}
