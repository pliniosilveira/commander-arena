/**
 * Words for the monarch (CR 725, D-127). The monarch's two inherent triggered abilities have no source, so
 * the view shows them as "The monarch" (`ObjectView.name`) with no `abilitySource` and no card behind them:
 * there is nothing to hover. Their words are composed from the ability's AST, relative to the viewer, never
 * from a name: "At the beginning of your end step, draw a card." and "Whenever a creature deals combat damage
 * to you, its controller becomes the monarch."
 *
 * The three abilities of the Ring (CR 701.54c, D-196) are inherent in the same way and are worded here too, from the kind of trigger (the monarch's
 * `dealsCombatDamage` is about any creature, the Ring's about the Ring-bearer, `this`): the view calls them "The Ring".
 */
import type { ObjectView, StackAbility, Trigger } from '@commander-arena/engine';

/** The name the engine gives the abilities of the monarch (`ObjectView.name`). */
export const MONARCH_NAME = 'The monarch';

/** The name the engine gives the abilities of the Ring (`ObjectView.name`, CR 701.54c, D-196). */
export const RING_NAME = 'The Ring';

/** The name of an inherent ability (`StackData.inherent`): "The Ring" for the Ring's three, else "The monarch". */
export const inherentNameOf = (inherent: string): string =>
  inherent.startsWith('ring') ? RING_NAME : MONARCH_NAME;

/** True for an ability on the stack that has no source: the monarch's (CR 725.2). */
export function isInherentAbility(o: Pick<ObjectView, 'ability' | 'abilitySource'>): boolean {
  return o.ability !== undefined && o.abilitySource === undefined;
}

/**
 * The sentence of one inherent ability for a viewer, read from its trigger (the two differ by it); `mine` is
 * true when the viewer controls it, that is, when the viewer is the monarch. Null for any other trigger.
 */
export function inherentTriggerWording(trigger: Trigger, mine: boolean): string | null {
  const bearer = mine ? 'your Ring-bearer' : "the opponent's Ring-bearer";
  // CR 701.54c (D-196): the Ring's abilities.
  if (trigger.kind === 'attacks') {
    return `Whenever ${bearer} attacks, ${mine ? 'draw a card, then discard a card' : 'they draw a card, then discard a card'}.`;
  }
  if (trigger.kind === 'becomesBlocked') {
    return `Whenever ${bearer} becomes blocked by a creature, the blocking creature's controller sacrifices it at end of combat.`;
  }
  if (
    trigger.kind === 'dealsCombatDamage' &&
    'kind' in trigger.what &&
    trigger.what.kind === 'this'
  ) {
    return `Whenever ${bearer} deals combat damage to a player, each opponent loses 3 life.`;
  }
  if (trigger.kind === 'endStep') {
    return mine
      ? 'At the beginning of your end step, draw a card.'
      : "At the beginning of the opponent's end step, they draw a card.";
  }
  if (trigger.kind === 'dealsCombatDamage') {
    return `Whenever a creature deals combat damage to ${mine ? 'you' : 'the opponent'}, its controller becomes the monarch.`;
  }
  return null;
}

/** The same for an ability on the stack: null for an activated one. */
export function inherentWording(ability: StackAbility, mine: boolean): string | null {
  return ability.kind === 'triggered' ? inherentTriggerWording(ability.trigger, mine) : null;
}
