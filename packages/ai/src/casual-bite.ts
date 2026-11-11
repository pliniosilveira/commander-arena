/**
 * CasualAgent and spells in which a creature deals the damage (D-131): "Target creature you control deals damage
 * equal to its power to target creature you don't control." The slot whose legal targets are all the agent's own
 * creatures names the one that deals the damage, so the strongest of them is chosen (the damage is its power), and the
 * other slots keep the ordinary opponent-first choice. The ordinary choice would take the first creature in the
 * engine's order, which is the weakest as often as not.
 */
import type { ChosenTarget, GameView, TargetsDecision } from '@commander-arena/engine';
import { findObject, isCreature, powerOf } from './casual-view';

/** "... deals damage equal to its power": the text of a spell in which a creature is the source (a "bite"). */
const BITE = /\bdeals? damage equal to its power\b/i;

/** Whether the spell this decision is for reads as a bite. */
export function isBiteSpell(view: GameView, d: TargetsDecision): boolean {
  const source = findObject(view, d.source);
  return source !== undefined && BITE.test(source.oracleText);
}

/**
 * The agent's own creature with the most power among a slot's legal targets, when every legal target is one of its own
 * creatures (the slot of the creature that deals the damage); null for any other slot.
 */
export function strongestOwnCreature(
  view: GameView,
  legal: readonly ChosenTarget[],
): ChosenTarget | null {
  let best: { target: ChosenTarget; power: number } | undefined;
  for (const target of legal) {
    const o = target.kind === 'object' ? findObject(view, target.id) : undefined;
    if (o === undefined || o.controller !== view.viewer || !isCreature(o)) return null;
    if (best === undefined || powerOf(o) > best.power) best = { target, power: powerOf(o) };
  }
  return best?.target ?? null;
}
