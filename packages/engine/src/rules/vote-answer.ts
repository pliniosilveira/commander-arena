/**
 * The answer to a vote (CR 701.38a, D-194): the option the voter chose is added to the votes of the `vote` instruction at the head of the queue,
 * logged as an `optionChosen` event of purpose 'vote' (not for a secret vote: nothing is shown until `votesRevealed`), and the resolution goes on (to the next voter, or, when everyone has voted,
 * to the rest of the spell or ability). Kept apart from `stack.ts`, which holds the other answers, to stay small.
 */
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { continueResolution, type ResolveOutcome } from './stack';

/** Null when no vote is waiting for this answer, or the option is not one of those offered. */
export function answerResolutionVote(state: GameState, option: string): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  const d = state.pending;
  if (!res || head?.kind !== 'vote' || d?.kind !== 'chooseOption' || d.purpose !== 'vote') {
    return null;
  }
  if (!d.options.includes(option)) return null;
  const updated: Instruction = { ...head, cast: [...head.cast, { seat: d.seat, option }] };
  const events: GameEvent[] =
    head.secret === true
      ? []
      : [
          {
            kind: 'optionChosen',
            seat: d.seat,
            source: d.source,
            // CR 701.38c: a choice made by "each opponent chooses" is not a vote.
            purpose: head.voters === undefined ? 'vote' : 'option',
            option,
          },
        ];
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    events,
  );
}
