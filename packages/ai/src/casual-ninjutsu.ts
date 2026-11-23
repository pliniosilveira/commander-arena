/**
 * CasualAgent and Ninjutsu (CR 702.49a, UNVERIFIED rule number: the CR text is not in the repository): "{cost}, Return an unblocked attacker you control to hand: Put this card onto
 * the battlefield from your hand tapped and attacking." The engine lists the `activate` option only in the steps after the blockers were declared, with an unblocked attacker of the
 * agent's own and the mana to pay, so the agent has only the question of whether it is worth it: the Ninja is a creature card with more power than the weakest unblocked attacker the
 * cost can return. The attacker returned is the one the cost's `choosePermanent` (purpose 'bounce') hands to the agent's usual rule for permanents it gives up (the least valuable), the
 * Ninja takes its place against the same player, and the returned creature is cast again later. The loop guard of `casual-activations.ts` applies.
 */
import type { ActivatedAbility, GameView, ObjectView } from '@commander-arena/engine';
import { findObject, isCreature, powerOf } from './casual-view';

/** "{cost}, Return an unblocked attacker you control to hand: Put this card onto the battlefield tapped and attacking": the shape the engine writes for Ninjutsu. */
export function isNinjutsuAbility(ability: ActivatedAbility): boolean {
  return (
    ability.functionsIn === 'hand' &&
    ability.cost.some(
      (c) => c.kind === 'returnToHand' && 'unblocked' in c.what && c.what.unblocked === true,
    )
  );
}

/** The unblocked attackers of the agent that the cost may return (CR 509.1h): in combat, not blocked, controlled by the agent. */
function unblockedAttackersOf(view: GameView): ObjectView[] {
  const out: ObjectView[] = [];
  for (const a of view.combat?.attackers ?? []) {
    if (a.blocked) continue;
    const obj = findObject(view, a.object);
    if (obj !== undefined && obj.controller === view.viewer && isCreature(obj)) out.push(obj);
  }
  return out;
}

/** Whether to put `ninja`, a card of ours in hand, onto the battlefield attacking in place of our weakest unblocked attacker. */
export function wantsNinjutsu(view: GameView, ninja: ObjectView): boolean {
  if (ninja.zone !== 'hand' || ninja.owner !== view.viewer || !isCreature(ninja)) return false;
  const weakest = Math.min(...unblockedAttackersOf(view).map(powerOf));
  return Number.isFinite(weakest) && powerOf(ninja) > weakest;
}
