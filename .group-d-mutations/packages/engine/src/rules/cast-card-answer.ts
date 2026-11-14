/**
 * The answers to the question of `castCard` (D-350, CR 608.2g: "you may cast target instant or sorcery card from a graveyard"), apart from `rules/cast-card.ts` because
 * they start a cast (`rules/cast.ts`) and go on with a resolution (`rules/stack.ts`), which the interpreter that runs the instruction cannot import (as for Cascade,
 * `rules/cascade-cast.ts`).
 *
 * Accepting begins the cast as CR 608.2g says: the steps of CR 601.2a-i, no player receives priority, the spell becomes the topmost object of the stack and the ability
 * goes on resolving, which `applyAction` does once the cast is finished. The spell is cast paying its mana cost; the riders of the effect (mana of any type, exile instead
 * of a graveyard) are put on it as it is cast. Declining leaves the card in its graveyard. The cast can be taken back with `cancel` at any question (CR 733): that rewinds to
 * the question, as it was asked.
 */
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { beginCast } from './cast';
import type { CastCardInstruction } from './cast-card';
import { fail, ok, type Result } from './result';
import { continueResolution, type ResolveOutcome } from './stack';

/** The instruction at the head of the queue when the pending question is the one `castCard` asked. */
function asking(
  state: GameState,
): { head: CastCardInstruction; rest: readonly Instruction[] } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'castCard' || head.stage !== 'ask') return null;
  if (state.pending?.kind !== 'confirmOptional' || state.pending.purpose !== 'castCard') {
    return null;
  }
  return { head, rest: res.queue.slice(1) };
}

/** Declining (or a card that turns out not to be castable): the card stays in its graveyard and the resolution goes on. Null when the question is not the one pending. */
export function declineCastCard(state: GameState): ResolveOutcome | null {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null) return null;
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: res.controller, source: res.source, accepted: false },
  ];
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: a.rest } },
    events,
  );
}

/**
 * Accepting starts the cast. `beginCast` is given the state as the question left it, so that `cancel` returns there; the resolution it leaves behind has only the rest of
 * the queue, for when the spell has been cast. A refused cast is an error the caller answers by declining.
 */
export function acceptCastCard(state: GameState): Result {
  const a = asking(state);
  const res = state.resolution;
  if (a === null || res === null) return fail('Nothing is asking');
  const begun = beginCast(state, res.controller, a.head.card, undefined, 0, true, false, {
    anyManaType: a.head.anyManaType,
    exileInstead: a.head.exileInstead,
  });
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
