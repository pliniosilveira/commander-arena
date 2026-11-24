/**
 * "Starting with you, each player votes for profit or security" (`vote`, CR 701.38a, 701.38b, D-194) and "each player votes for a player" / "secretly votes for a creature you don't control"
 * (`voteFor`). Each player still in the game, in turn order from the controller of the spell or ability that resolves, chooses one of the choices with a `chooseOption` decision (`purpose`
 * 'vote'), asked of that player and answered by them (`vote-answer.ts` records the answer on the instruction and goes on). The choices are words of the card (an option is the word), players
 * (`seat:<n>`) or permanents (`object:<id>`), CR 701.38b. A vote is public as it is cast: every decision carries the votes already made and each vote is logged as it happens (an
 * `optionChosen` event). A secret vote (CR 701.38a, "secretly") shows nothing: the decision carries no votes, nothing is logged, and when every player has voted one `votesRevealed` event
 * shows them all. When every player has voted the tally goes to the resolution (`ResolutionContext.votes`), which the amount `votesFor` reads, and the record of who voted for what to
 * `ResolutionContext.voteCast` and to the triggers `votingFinished` (the event). One vote for each player: CR 701.38d (a player with several votes) is not supported, and a spell or ability that
 * gives some is not read by the parser.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId } from '../ids';
import { objectsInZone, seatsInOrder } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { objectOption, seatOption, tallyCast } from './vote-options';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type VoteInstruction = Extract<Instruction, { kind: 'vote' }>;

/** The tally of a finished vote of words: the votes for each of the options (kept for the callers that name them). */
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

/** The permanents on the battlefield `filter` names, read for the controller of the effect (CR 701.38b: "a creature you don't control"). */
function candidatePermanents(
  state: GameState,
  res: ResolutionContext,
  filter: ObjectFilter,
): ObjectId[] {
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      matchesFilter(
        state,
        obj,
        { ...filter, zone: 'battlefield' },
        { controller: res.controller, source: res.source },
      )
    );
  });
}

/** What a voter chooses among: the words of the card, every player still in the game, or the permanents the filter names (CR 701.38b), with what each stands for. */
function choicesOf(
  state: GameState,
  res: ResolutionContext,
  instruction: VoteInstruction,
): {
  readonly options: readonly string[];
  readonly labels?: NonNullable<
    NonNullable<Extract<StepOutcome['needs'], { kind: 'chooseOption' }>['vote']>['choices']
  >;
} {
  const choices = instruction.choices;
  if (choices === undefined) return { options: instruction.options };
  if (choices.kind === 'players') {
    const seats = seatsInOrder(state, res.controller);
    return {
      options: seats.map(seatOption),
      labels: seats.map((seat) => ({ kind: 'player' as const, seat })),
    };
  }
  const ids = candidatePermanents(state, res, choices.filter);
  return {
    options: ids.map(objectOption),
    labels: ids.map((object) => ({
      kind: 'object' as const,
      object,
      name: sourceInfo(state, object)?.name ?? '',
    })),
  };
}

export function runVote(
  state: GameState,
  res: ResolutionContext,
  instruction: VoteInstruction,
): StepOutcome {
  const voted = new Set(instruction.cast.map((c) => c.seat));
  const { options, labels } = choicesOf(state, res, instruction);
  // CR 701.38a: starting with the player named (the controller) and proceeding in turn order. With no choice to vote for (no permanent matches) nobody votes.
  const next =
    options.length === 0
      ? undefined
      : seatsInOrder(state, res.controller).find((seat) => !voted.has(seat));
  if (next === undefined) {
    const cast = instruction.cast;
    const revealed =
      cast.length === 0
        ? []
        : [
            {
              kind: 'votesRevealed' as const,
              source: res.object,
              controller: res.controller,
              cast,
              secret: instruction.secret === true,
            },
          ];
    return {
      ...done(state, revealed),
      votes: tallyCast(cast),
      voteCast: cast,
    };
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
      options,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
      vote: {
        controller: res.controller,
        // CR 701.38a ("secretly"): a later voter is not told what the earlier ones chose.
        cast: instruction.secret === true ? [] : instruction.cast,
        ...(instruction.secret === true ? { secret: true as const } : {}),
        ...(labels === undefined ? {} : { choices: labels }),
      },
    },
  };
}
