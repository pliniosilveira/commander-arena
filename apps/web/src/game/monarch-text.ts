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

/** The name the engine gives the inherent ability of speed (`ObjectView.name`, CR 702.179d). */
export const SPEED_NAME = 'Speed';

/** The name the engine gives the abilities of the initiative (`ObjectView.name`, CR 726.2). */
export const INITIATIVE_NAME = 'The initiative';

/** The name the engine gives the room abilities of Undercity (`ObjectView.name`, CR 309.4c). */
export const UNDERCITY_NAME = 'Undercity';

/** The name of an inherent ability (`StackData.inherent`): "The Ring" for the Ring's three, "Speed" for the speed of a player, "The initiative", the dungeon of a room ability, else "The monarch". */
export const inherentNameOf = (inherent: string): string =>
  inherent.startsWith('ring')
    ? RING_NAME
    : inherent === 'speedUp'
      ? SPEED_NAME
      : inherent.startsWith('initiative')
        ? INITIATIVE_NAME
        : inherent.startsWith('room:')
          ? UNDERCITY_NAME
          : MONARCH_NAME;

/**
 * Whether an ability on the stack is one of the initiative's or a room ability of a dungeon (CR 726.2, 309.4c): the engine states their words in the object's own text
 * (the trigger they carry is never read), so they are shown as it gives them.
 */
export const hasOwnWords = (o: Pick<ObjectView, 'name'>): boolean =>
  o.name === INITIATIVE_NAME || o.name === UNDERCITY_NAME;

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
  // CR 702.179d (issue 144): the inherent ability of speed.
  if (trigger.kind === 'lifeLost') {
    return mine
      ? 'Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1.'
      : 'Whenever one or more of your opponents lose life during their turn, if their speed is less than 4, their speed increases by 1.';
  }
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
