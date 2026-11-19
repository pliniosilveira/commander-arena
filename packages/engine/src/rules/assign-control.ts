/**
 * "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen." (issue 81, Dack Fayden, CR 613.1b, 611.2a,
 * 101.4): the `assignControlToOpponents` effect, run as an instruction. The controller of the effect goes through the permanents in order and chooses, for each, an opponent that was
 * not chosen for an earlier one (a `chooseOption` decision of purpose `assignOpponent`, the options `seat:<n>`); with one opponent left there is nothing to choose and that one is
 * taken, and a permanent with no opponent left is not given. When every choice is made, each opponent gains control of the permanent they were chosen for: one layer 2 effect with no
 * duration for each, made one after the other (CR 613.7b), through `gainControlOfEach`. A permanent that has left the battlefield is skipped (CR 608.2b).
 */
import type { SeatId } from '../ids';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { gainControlOfEach } from './control-effects';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

export type AssignControlInstruction = Extract<Instruction, { kind: 'assignControl' }>;

/** The option a decision lists for an opponent. */
export const assignOpponentOption = (seat: SeatId): string => `seat:${seat}`;

export function runAssignControl(
  state: GameState,
  res: ResolutionContext,
  ins: AssignControlInstruction,
): StepOutcome {
  // A permanent that has left the battlefield is skipped, and so is every one after the opponents run out.
  const objects = ins.objects.filter((o) => state.objects[o]?.zone === 'battlefield');
  const object = ins.free.length === 0 ? undefined : objects[0];
  if (object === undefined) {
    const given = gainControlOfEach(state, ins.pairs);
    return done(given.state, given.events);
  }
  const next = (seat: SeatId): StepOutcome =>
    done(
      state,
      [
        {
          kind: 'optionChosen',
          seat: res.controller,
          source: res.object,
          purpose: 'assignOpponent',
          option: assignOpponentOption(seat),
        },
      ],
      [
        {
          ...ins,
          objects: objects.slice(1),
          free: ins.free.filter((s) => s !== seat),
          pairs: [...ins.pairs, [object, seat]],
          chosen: null,
        },
      ],
    );
  if (ins.chosen !== null) {
    const picked = ins.free.find((s) => assignOpponentOption(s) === ins.chosen);
    // An answer that names no opponent left is not taken: the question is asked again.
    if (picked !== undefined) return next(picked);
  }
  const [only] = ins.free;
  if (ins.free.length === 1 && only !== undefined) return next(only);
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: res.controller,
      purpose: 'assignOpponent',
      options: ins.free.map(assignOpponentOption),
      assignFor: object,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    },
  };
}
