/**
 * HeuristicAgent's vote (CR 701.38a, D-194, `purpose` 'vote'). The options of a vote are words with no rules meaning (CR 701.38b), so the agent reads
 * what each leads to instead of the words: on a determinized sample of the game (the same state, with what the agent cannot know drawn again) it casts
 * each option through the engine's own `applyAction`, lets the players still to vote answer as the casual agent does (`casual-vote.ts`), plays on until
 * the vote is over (the effect has resolved) and scores the board with the evaluator from the agent's own seat. The option with the best score wins; a
 * tie goes to the first option the card lists, which makes the answer deterministic. A candidate the engine refuses, or a run that does not end the
 * vote within a few steps, is dropped; with none left (or with no sample) the casual answer stands. The same rule serves the controller (it picks
 * what is best for it) and the other players (it picks what is best for them, which is what is worst for the controller).
 */
import {
  type Action,
  type ChooseOptionDecision,
  type GameState,
  getView,
} from '@commander-arena/engine';
import { evaluate } from './evaluate';
import { applyOrNull, playOut } from './heuristic-sim';

/** The vote that asked is over: another decision, or the end of the game. */
const voteOver =
  (d: ChooseOptionDecision) =>
  (s: GameState): boolean =>
    s.result !== null ||
    s.pending === null ||
    !(
      s.pending.kind === 'chooseOption' &&
      s.pending.purpose === 'vote' &&
      s.pending.source === d.source
    );

/** Enough steps for the other voters of a vote. */
const VOTE_STEPS = 12;

export function chooseVoteByOutcome(
  d: ChooseOptionDecision,
  sample: GameState | undefined,
  fallback: Action,
): Action {
  const asked = sample?.pending;
  if (
    sample === undefined ||
    asked?.kind !== 'chooseOption' ||
    asked.purpose !== 'vote' ||
    asked.seat !== d.seat
  ) {
    return fallback;
  }
  let best: Action | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const option of d.options) {
    const action: Action = { kind: 'chooseOption', option };
    const cast = applyOrNull(sample, d.seat, action);
    if (cast === null) continue;
    const end = playOut(cast, d.seat, {}, voteOver(d), VOTE_STEPS);
    if (end === null) continue;
    const { score } = evaluate(getView(end, d.seat), d.seat);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best ?? fallback;
}
