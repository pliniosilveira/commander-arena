/**
 * "Starting with you, each player votes for profit or security" (`vote`, CR 701.38a, 701.38b, D-194). Each player still in the game, in turn order
 * from the controller of the spell or ability that resolves, chooses one of the options with a `chooseOption` decision (`purpose` 'vote'), asked of
 * that player and answered by them (`vote-answer.ts` records the answer on the instruction and goes on). A vote is public as it is cast: every
 * decision carries the votes already made, and each vote is logged as it happens (an `optionChosen` event). When every player has voted the
 * tally goes to the resolution (`ResolutionContext.votes`), which the amount `votesFor` reads. One vote for each player: CR 701.38d (a player
 * with several votes) is not supported, and a spell or ability that gives some is not read by the parser.
 */
import { seatsInOrder } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type VoteInstruction = Extract<Instruction, { kind: 'vote' }>;

/** The tally of a finished vote: how many players voted for each option (an option nobody chose is left out). */
export function tallyOf(
  options: readonly string[],
  cast: VoteInstruction['cast'],
): Readonly<Record<string, number>> {
  const tally: Record<string, number> = {};
  for (const option of options) {
    const n = cast.filter((c) => c.option === option).length;
    if (n > 0) tally[option] = n;
  }
  return tally;
}

export function runVote(
  state: GameState,
  res: ResolutionContext,
  instruction: VoteInstruction,
): StepOutcome {
  const voted = new Set(instruction.cast.map((c) => c.seat));
  // CR 701.38a: starting with the player named (the controller) and proceeding in turn order.
  const next = seatsInOrder(state, res.controller).find((seat) => !voted.has(seat));
  if (next === undefined) {
    return { ...done(state), votes: tallyOf(instruction.options, instruction.cast) };
  }
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: next,
      purpose: 'vote',
      options: instruction.options,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
      vote: { controller: res.controller, cast: instruction.cast },
    },
  };
}
