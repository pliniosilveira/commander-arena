/**
 * Face-down permanents (CR 701.40, 708, D-313): the one thing an agent decides about them is turning one of its own face up.
 *
 * An agent sees only its view: its own face-down permanent is a 2/2 creature with `hiddenFace`, `turnFaceUpCost` and `ifFaceUp` (what it would be face up now: power,
 * toughness and keywords); an opponent's is the same 2/2 with a label and nothing of the card, so the agents cannot peek and play against it as against any 2/2. The engine lists
 * the option `turnFaceUp` only when the card is a creature card with a mana cost the player can pay now, so a manifested land or instant is never offered.
 *
 * Turning up is worth doing when the creature gets better: the gain is the evaluator's value of the creature as it would be face up (`ifFaceUp`) minus its value as it is. It costs
 * the mana of the card, which the agent has left after what it wants to cast (the casual agent turns up after its spells, the heuristic agent plans its spells first and
 * turns up with what is left). A creature that would be worse or the same face up (a 1/1, a 2/2 without a keyword) stays face down: nothing is gained, and the card stays hidden.
 */
import type { Action, GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { creatureValue } from './evaluate';

/** The creature must gain at least this much value (score points; a card in hand is worth 1.2) for the mana to be worth spending. */
export const TURN_UP_MARGIN = 0.5;

/** What turning `o` face up would add to its value: the creature as it would be face up (`ifFaceUp`) minus the creature as it is. Null when it can't be turned up. */
export function turnUpGain(o: ObjectView): number | null {
  const up = o.ifFaceUp;
  if (up === undefined) return null;
  const faceUp: ObjectView = {
    ...o,
    power: up.power,
    toughness: up.toughness,
    keywords: up.keywords,
  };
  return creatureValue(faceUp) - creatureValue(o);
}

/** The face-down permanents of the viewer that the engine offers to turn up, with what each would gain, the biggest gain first (ties by id). */
export function turnUpCandidates(
  view: GameView,
  d: PriorityDecision,
): { readonly object: ObjectView; readonly gain: number }[] {
  const out: { readonly object: ObjectView; readonly gain: number }[] = [];
  for (const option of d.options) {
    if (option.kind !== 'turnFaceUp') continue;
    const object = view.battlefield.find((o) => o.id === option.object);
    const gain = object === undefined ? null : turnUpGain(object);
    if (object !== undefined && gain !== null) out.push({ object, gain });
  }
  return out.sort((a, b) => b.gain - a.gain || (a.object.id < b.object.id ? -1 : 1));
}

/**
 * The turn-up the agent makes in its own main phase with the stack empty, or null: the one that gains the most when the gain is worth the mana. Before combat the
 * creature that was turned up can attack as what it is (the permanent is the same object, so it is as ready as it was).
 */
export function chooseTurnFaceUp(view: GameView, d: PriorityDecision): Action | null {
  const mine = view.activeSeat === view.viewer;
  const main = view.step === 'precombatMain' || view.step === 'postcombatMain';
  if (!mine || !main || view.stack.length > 0) return null;
  const best = turnUpCandidates(view, d)[0];
  if (best === undefined || best.gain < TURN_UP_MARGIN) return null;
  return { kind: 'turnFaceUp', object: best.object.id };
}
