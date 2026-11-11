/**
 * "Start the action, then answer its target with the drop": the two decisions of an Equip drop or
 * an Aura drop (CR 702.6a, 303.4a), sent one after the other through the page's store, so every
 * step is an ordinary action in the log, undoable like the click path's.
 *
 * 1. `start` (`activate` or `castSpell`) goes in. The engine answers with its `targets` decision.
 * 2. That decision is read, not assumed: the dropped permanent must be a legal target of the slot
 *    (the Aura's `enchant` slot, or the slot that lists it for Equip). Then `chooseTargets` goes
 *    in with it, and the page's autopilot pays automatically (auto-pay is the default; with manual
 *    payment on, the payment overlay opens as for a click).
 * 3. If the engine does not offer the permanent (a protection or a rule the view cannot show), the
 *    action is cancelled, which puts the game back where it was, and the player is told.
 * 4. Anything else (the start was refused, a kicker question comes first, another slot needs a
 *    choice) is left to the click path: the decision stays open and the player answers it.
 */
import type { Action, ChosenTarget, GameView, ObjectId } from '@commander-arena/engine';
import type { AppStore } from '../../store';
import { type Index, nameOf, objectIndex } from '../decisions/lookup';
import { ENCHANT_SPEC } from '../decisions/target-prompt';

export interface AttachDeps {
  /** The store's `act`: resolves when the autopilot has stopped again. */
  act(action: Action): Promise<void>;
  /** The latest view, read after each step. */
  view(): GameView | null;
  /** Shows the player a message (the store's error line). */
  fail(message: string): void;
}

/** The flow's view of the page's store. */
export function attachDeps(store: AppStore): AttachDeps {
  return {
    act: (action) => store.getState().act(action),
    view: () => store.getState().snapshot?.view ?? null,
    fail: (message) => store.getState().fail(message),
  };
}

export type AttachOutcome = 'attached' | 'cancelled' | 'left';

/** The target that answers the pending `targets` decision with `host`, or why it cannot. */
function answerFor(
  specs: readonly { specId: string; min: number; max: number; legal: readonly ChosenTarget[] }[],
  host: ObjectId,
  isAura: boolean,
): ChosenTarget | 'no-host' | 'more-slots' {
  const slot = isAura
    ? specs.find((s) => s.specId === ENCHANT_SPEC)
    : specs.find((s) => s.legal.some((t) => t.kind === 'object' && t.id === host));
  const target = slot?.legal.find((t) => t.kind === 'object' && t.id === host);
  if (slot === undefined || target === undefined) return 'no-host';
  if (specs.some((s) => s !== slot && s.min > 0)) return 'more-slots';
  return { kind: 'object', id: host, specId: slot.specId };
}

function failText(name: string, index: Index, host: ObjectId): string {
  return `${name} cannot be attached to ${nameOf(index, host)}.`;
}

export async function startAndTarget(
  deps: AttachDeps,
  start: Action,
  host: ObjectId,
): Promise<AttachOutcome> {
  // Named before the start: a spell gets a new object on the stack, the card in hand is gone.
  const first = deps.view();
  const name =
    first !== null && (start.kind === 'activate' || start.kind === 'castSpell')
      ? nameOf(objectIndex(first), start.object)
      : 'It';
  await deps.act(start);
  const view = deps.view();
  const pending = view?.pending;
  if (view === null || pending?.kind !== 'targets') return 'left';
  const answer = answerFor(pending.specs, host, start.kind === 'castSpell');
  if (answer === 'more-slots') return 'left';
  if (answer === 'no-host') {
    await deps.act({ kind: 'cancel' });
    deps.fail(failText(name, objectIndex(view), host));
    return 'cancelled';
  }
  await deps.act({ kind: 'chooseTargets', targets: [answer] });
  return 'attached';
}
