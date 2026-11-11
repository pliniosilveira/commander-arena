/**
 * The answer to Cascade's question (CR 702.85a, 608.2g, D-120): "You may cast that card without paying its mana
 * cost." It lives apart from `rules/cascade.ts` because it starts a cast (`rules/cast.ts`) and goes on with a
 * resolution (`rules/stack.ts`), which the interpreter that runs cascade cannot import.
 *
 * Declining goes on to put the exiled cards on the bottom. Accepting begins the free cast of the card found, as
 * CR 608.2g says: the steps of CR 601.2a-i (modes, kicker, targets, the additional costs), no player receives
 * priority, the spell becomes the topmost object of the stack, and the cascade ability goes on resolving, which
 * `applyAction` does once the cast is finished (it sees a resolution with nothing pending). The cast can be taken
 * back with `cancel` at any question (CR 733): that rewinds to this question, as it was asked.
 */
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import type { CascadeInstruction } from './cascade';
import { beginCast } from './cast';
import { fail, ok, type Result } from './result';
import { continueResolution, type ResolveOutcome } from './stack';

/** The cascade instruction at the head of the resolution queue, when its question is the one pending. */
function askingCascade(
  state: GameState,
): { head: CascadeInstruction; rest: readonly Instruction[] } | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'cascade' || head.stage !== 'ask') return null;
  if (state.pending?.kind !== 'confirmOptional' || state.pending.purpose !== 'cascade') return null;
  return { head, rest: res.queue.slice(1) };
}

/**
 * Declining (or a card that turns out not to be castable): the card stays in exile and goes to the bottom with
 * the others, and the resolution goes on. Null when the question is not the one pending.
 */
export function declineCascade(state: GameState): ResolveOutcome | null {
  const asking = askingCascade(state);
  const res = state.resolution;
  if (asking === null || res === null) return null;
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: res.controller, source: res.source, accepted: false },
  ];
  // D-151: a card of Discover that is not cast goes into the hand: it is still `found` for the last stage.
  const queue: readonly Instruction[] = [
    {
      ...asking.head,
      stage: 'bottom',
      found: asking.head.variant === undefined ? null : asking.head.found,
    },
    ...asking.rest,
  ];
  return continueResolution({ ...state, pending: null, resolution: { ...res, queue } }, events);
}

/**
 * Accepting starts the cast. `beginCast` is given the state as the question left it, so that `cancel` returns
 * there; the resolution it leaves behind then has the `bottom` stage at the head of its queue, for when the
 * spell has been cast. A refused cast (it cannot be cast after all) is an error the caller answers by declining.
 */
export function acceptCascade(state: GameState): Result {
  const asking = askingCascade(state);
  const res = state.resolution;
  if (asking === null || res === null || asking.head.found === null) {
    return fail('Cascade is not asking');
  }
  const begun = beginCast(state, res.controller, asking.head.found, 'free', 0, true);
  if (!begun.ok) return begun;
  const resolving = begun.state.resolution;
  if (resolving === null) return fail('The resolution is gone');
  const queue: readonly Instruction[] = [
    { ...asking.head, stage: 'bottom', found: null },
    ...asking.rest,
  ];
  const accepted: GameEvent = {
    kind: 'optionalAnswered',
    seat: res.controller,
    source: res.source,
    accepted: true,
  };
  return ok({ ...begun.state, resolution: { ...resolving, queue } }, [accepted, ...begun.events]);
}
