/**
 * The answers to the question of `castExiled` (CR 702.62a Suspend, CR 702.35a Madness, CR 702.94a Miracle, D-128, D-274), apart from
 * `rules/cast-exiled.ts` because they start a cast (`rules/cast.ts`) and go on with a resolution (`rules/stack.ts`),
 * which the interpreter that runs the instruction cannot import (as for Cascade, `rules/cascade-cast.ts`).
 *
 * Accepting begins the cast as CR 608.2g says: the steps of CR 601.2a-i, no player receives priority, the spell
 * becomes the topmost object of the stack and the ability goes on resolving, which `applyAction` does once the cast
 * is finished. Declining leaves a suspended card in exile, puts a card exiled by madness into the graveyard and leaves a miracle card in the hand. The
 * cast can be taken back with `cancel` at any question (CR 733): that rewinds to the question, as it was asked.
 */
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { beginCast } from './cast';
import type { CastExiledInstruction } from './cast-exiled';
import { moveInstructions } from './effect-support';
import { fail, ok, type Result } from './result';
import { continueResolution, type ResolveOutcome } from './stack';

/** The instruction at the head of the queue when the pending question is the one `castExiled` asked. */
function asking(
  state: GameState,
): { head: CastExiledInstruction; rest: readonly Instruction[] } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'castExiled' || head.stage !== 'ask') return null;
  const purpose = state.pending?.kind === 'confirmOptional' ? state.pending.purpose : undefined;
  if (purpose !== 'suspend' && purpose !== 'madness' && purpose !== 'miracle') return null;
  return { head, rest: res.queue.slice(1) };
}

/**
 * Declining (or a card that turns out not to be castable): the suspended card stays exiled; a card exiled by madness
 * goes to its owner's graveyard; a card revealed by miracle stays in the hand. The resolution goes on. Null when the question is not the one pending.
 */
export function declineCastExiled(state: GameState): ResolveOutcome | null {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null) return null;
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: res.controller, source: res.source, accepted: false },
  ];
  const put: readonly Instruction[] =
    a.head.mode === 'madness' && a.head.card !== null
      ? moveInstructions([a.head.card], 'graveyard')
      : [];
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [...put, ...a.rest] } },
    events,
  );
}

/**
 * Accepting starts the cast. `beginCast` is given the state as the question left it, so that `cancel` returns there;
 * the resolution it leaves behind has only the rest of the queue, for when the spell has been cast. A refused cast
 * is an error the caller answers by declining.
 */
export function acceptCastExiled(state: GameState): Result {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null || a.head.card === null) return fail('Nothing is asking');
  const card: ObjectId = a.head.card;
  const suspend = a.head.mode === 'suspend';
  const begun = beginCast(
    state,
    res.controller,
    card,
    a.head.mode === 'suspend' ? 'free' : a.head.mode,
    0,
    true,
    suspend,
  );
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
