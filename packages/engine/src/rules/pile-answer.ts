/**
 * The answer of the chooser of the piles (CR 700.3, D-971): the option (`pile1` or `pile2`) is recorded on the `pileSeparate` instruction at the head of the queue and the
 * resolution goes on. Kept apart from `pile-separate.ts` (which `effects.ts` imports) because it needs `stack.ts`, which imports `effects.ts`.
 */
import type { GameState, Instruction } from '../state/types';
import { continueResolution, type ResolveOutcome } from './stack';

/** Null when no pile choice is waiting for this answer, or the option is not one of the two piles. */
export function answerResolutionPile(state: GameState, option: string): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  const d = state.pending;
  if (!res || head?.kind !== 'pileSeparate' || d?.kind !== 'chooseOption' || d.purpose !== 'pile') {
    return null;
  }
  const pick = option === 'pile1' ? 1 : option === 'pile2' ? 2 : null;
  if (pick === null || !d.options.includes(option)) return null;
  const updated: Instruction = { ...head, pick };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}
