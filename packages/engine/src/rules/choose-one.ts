/**
 * "Create a Food token or a Treasure token" as an instruction of a resolving spell or ability (`chooseOne`, D-175, CR 608.2d): the
 * controller of the effect chooses one of the instructions it offers as it resolves, with a `chooseOption` decision (purpose 'effect')
 * whose options are the words of the instructions, in order. The chosen instruction runs next; the others do nothing. It is not a
 * mode of a modal text: nothing is chosen when the spell or ability goes on the stack (CR 700.2), so a player cannot respond knowing it.
 */
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ChooseOneInstruction = Extract<Instruction, { kind: 'chooseOne' }>;

export function runChooseOne(
  state: GameState,
  res: ResolutionContext,
  instruction: ChooseOneInstruction,
): StepOutcome {
  const { options, chosen } = instruction;
  if (chosen !== null) {
    const picked = options[chosen];
    if (picked === undefined) return done(state);
    const event: GameEvent = {
      kind: 'optionChosen',
      seat: instruction.chooser ?? res.controller,
      source: res.object,
      purpose: 'effect',
      option: picked.label,
    };
    return done(state, [event], [{ kind: 'effect', effect: picked.effect }]);
  }
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: instruction.chooser ?? res.controller,
      purpose: 'effect',
      options: options.map((option) => option.label),
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    },
  };
}
