/**
 * The answer to the question of `castFree` (CR 608.2g, D-145: "You may cast a spell ... without paying its mana cost"), apart from
 * `rules/cast-free.ts` because it starts a cast (`rules/cast.ts`) and goes on with a resolution (`rules/stack.ts`), which the interpreter
 * that runs the instruction cannot import (as for Cascade, `rules/cascade-cast.ts`).
 *
 * Choosing a spell begins the cast as CR 608.2g says: the steps of CR 601.2a-i, no player receives priority, the spell becomes the topmost
 * object of the stack and the resolution goes on, which `applyAction` does once the cast is finished. The cast can be taken back with `cancel`
 * at any question (CR 733): that rewinds to the question, as it was asked. Choosing nothing ends the effect. Choosing a land is the
 * interpreter's: the land is played by the instruction (`rules/cast-free.ts`).
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { beginCast } from './cast';
import type { CastFreeInstruction } from './cast-free';
import { fail, ok, type Result } from './result';
import { continueResolution, type ResolveOutcome } from './stack';

/** The instruction at the head of the queue when the pending question is the one `castFree` asked. */
function asking(
  state: GameState,
): { head: CastFreeInstruction; rest: readonly Instruction[] } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'castFree' || head.chosen !== null) return null;
  if (state.pending?.kind !== 'chooseCards' || state.pending.purpose !== 'cast') return null;
  return { head, rest: res.queue.slice(1) };
}

/** Choosing no card: the effect is over and the resolution goes on. Null when the question is not the one pending. */
export function declineCastFree(state: GameState): ResolveOutcome | null {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null) return null;
  return continueResolution({ ...state, pending: null, resolution: { ...res, queue: a.rest } }, [
    { kind: 'optionalAnswered', seat: res.controller, source: res.source, accepted: false },
  ]);
}

/**
 * Choosing a spell starts its cast. `beginCast` is given the state as the question left it, so that `cancel` returns there; the resolution
 * it leaves behind has only the rest of the queue, for when the spell has been cast.
 */
export function acceptCastFree(state: GameState, card: ObjectId): Result {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null) return fail('Nothing is asking');
  const begun = beginCast(state, res.controller, card, 'free', 0, true);
  if (!begun.ok) return begun;
  const resolving = begun.state.resolution;
  if (resolving === null) return fail('The resolution is gone');
  const accepted: GameEvent = {
    kind: 'optionalAnswered',
    seat: res.controller,
    source: res.source,
    accepted: true,
  };
  return ok({ ...begun.state, resolution: { ...resolving, queue: a.rest } }, [
    accepted,
    ...begun.events,
  ]);
}
