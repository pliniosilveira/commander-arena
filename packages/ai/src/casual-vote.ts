/**
 * CasualAgent's vote (CR 701.38a, D-194, `purpose` 'vote': "starting with you, each player votes for profit or security"). The decision carries the
 * words of the options and the votes already cast, and nothing about what each option does (the options are words with no rules meaning, CR 701.38b,
 * so a casual agent that reads only the decision cannot weigh them; the HeuristicAgent plays the vote out on a sample instead, `heuristic-vote.ts`).
 * The rule is the same for every card and needs no randomness:
 *  - the player who controls the effect votes for the first option the card lists (the one the card names first);
 *  - any other player does not add to what the controller backs: it votes for the option with the fewest votes so far, and on a tie for the later
 *    option, so with two options it takes the one the controller did not.
 * Every answer is one of the options, so it is always legal.
 */
import type { Action, ChooseOptionDecision } from '@commander-arena/engine';

export function chooseVote(d: ChooseOptionDecision): Action {
  const first = d.options[0];
  if (first === undefined) throw new Error('a vote with no options');
  const cast = d.vote?.cast ?? [];
  if (d.vote === undefined || d.vote.controller === d.seat) {
    return { kind: 'chooseOption', option: first };
  }
  let best = first;
  let bestVotes = Number.POSITIVE_INFINITY;
  for (const option of d.options) {
    const votes = cast.filter((c) => c.option === option).length;
    if (votes <= bestVotes) {
      best = option;
      bestVotes = votes;
    }
  }
  return { kind: 'chooseOption', option: best };
}
