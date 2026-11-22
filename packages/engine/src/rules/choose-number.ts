/**
 * "Choose a number between 0 and 10." (Expel the Interlopers, CR 608.2d, 107.1): the `chooseNumber` effect, run as an instruction. The controller of the spell or ability is
 * asked for a whole number from `min` to `max` (a `chooseX` decision of purpose `chooseNumber`, no way back: nothing is cast or activated); the answer is kept in
 * `ResolutionContext.chosenNumber`, which `powerAtLeastChosenNumber` reads in the instructions after it, and the choice is public (an `optionChosen` event).
 */
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ChooseNumber = Extract<Instruction, { kind: 'chooseNumber' }>;

export function runChooseNumber(
  state: GameState,
  res: ResolutionContext,
  ins: ChooseNumber,
): StepOutcome {
  if (ins.amount !== null) return done(state);
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseX',
      seat: ins.seat,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
      purpose: 'chooseNumber',
      min: ins.min,
      max: ins.max,
      perX: { mana: 0, life: 0 },
    },
  };
}
