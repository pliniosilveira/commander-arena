/**
 * Rooms (CR 709.5): the one thing an agent decides about them besides casting a half like any permanent is unlocking a locked half of one of its own (CR 709.5e, the special action).
 *
 * The engine lists the option `unlockDoor` (the Room and which half) only when it is the agent's main phase with an empty stack and the half's mana cost can be paid, so every option
 * is legal. Unlocking only adds to the permanent (the half's name, mana cost and rules text start to count, and "When you unlock this door" triggers), so it is worth doing with
 * the mana the agent has left after its spells; the dearest half goes first, which is the best use of the mana (ties by Room id, then the left half).
 */
import type { Action, GameView, PriorityDecision } from '@commander-arena/engine';

/** The mana value of the half `door` of the Room `object`: the symbols of its printed mana cost counted (a hybrid or generic number by its value is not needed to order them). */
function doorWeight(view: GameView, object: string, door: number): number {
  const face = view.battlefield.find((o) => o.id === object)?.faces?.[door];
  return (face?.manaCost ?? []).reduce(
    (sum, symbol) => sum + (/^\d+$/u.test(symbol) ? Number(symbol) : 1),
    0,
  );
}

/** The unlock the agent makes in its own main phase with the stack empty, or null when none is offered. */
export function chooseUnlockDoor(view: GameView, d: PriorityDecision): Action | null {
  const mine = view.activeSeat === view.viewer;
  const main = view.step === 'precombatMain' || view.step === 'postcombatMain';
  if (!mine || !main || view.stack.length > 0) return null;
  const options = d.options.flatMap((o) => (o.kind === 'unlockDoor' ? [o] : []));
  const best = [...options].sort(
    (a, b) =>
      doorWeight(view, b.object, b.door) - doorWeight(view, a.object, a.door) ||
      (a.object < b.object ? -1 : a.object > b.object ? 1 : 0) ||
      a.door - b.door,
  )[0];
  return best === undefined ? null : { kind: 'unlockDoor', object: best.object, door: best.door };
}
