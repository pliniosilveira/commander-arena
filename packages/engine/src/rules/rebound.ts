/**
 * Rebound (CR 702.88a, 702.88c): "If this spell was cast from your hand, instead of putting it into your graveyard as it resolves, exile it and, at the beginning of your next upkeep,
 * you may cast this card from exile without paying its mana cost."
 *
 * The keyword is a static ability that works while the spell is on the stack (`rebounds`): the card goes to exile as the spell resolves in place of the graveyard, which a spell
 * that is countered, fizzles, or that another effect sends elsewhere does not do. The resolution then creates the delayed triggered ability (`reboundTrigger`), named for the
 * card in exile (CR 603.7c, 400.7: a card that left exile since is a new object and is not found). When it triggers, its controller may cast that card from exile without paying
 * its mana cost, as CR 702.88b says (an alternative-cost cast, CR 601.2b, 601.2f-h): the engine's `castFree` of the trigger's subject, which asks once and may be declined.
 */

import type { CardFace } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import type { DelayedTrigger, GameObject, TriggeredAbility } from '../state/types';

/** CR 702.88a: "at the beginning of your next upkeep, you may cast this card from exile without paying its mana cost". */
export const REBOUND_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
  effect: { kind: 'castFree', objects: { kind: 'triggerSubject' } },
};

/** Whether the face has Rebound (CR 702.88a; several instances are redundant, CR 702.88c). */
export function hasRebound(face: CardFace | null): boolean {
  return (face?.abilities ?? []).some((a) => a.kind === 'keyword' && a.keyword.kind === 'rebound');
}

/**
 * Whether the resolving spell is exiled by its Rebound (CR 702.88a): an instant or sorcery card with the keyword that was cast from its caster's hand, and that would go to the
 * graveyard (not a permanent, not one that another effect or keyword already sends to exile, to the hand or to a library).
 */
export function rebounds(
  face: CardFace | null,
  obj: GameObject,
  otherPlace: { readonly permanent: boolean; readonly elsewhere: boolean },
): boolean {
  return (
    !otherPlace.permanent &&
    !otherPlace.elsewhere &&
    obj.card !== null &&
    obj.stack?.kind === 'spell' &&
    obj.stack.castFrom === 'hand' &&
    obj.stack.flashback !== true &&
    obj.stack.jumpStart !== true &&
    obj.stack.aftermath !== true &&
    obj.stack.alt !== 'harmonize' &&
    obj.stack.exileInstead !== true &&
    hasRebound(face)
  );
}

/** CR 603.7, 603.7c: the delayed triggered ability of the card the rebounding spell became in exile; it belongs to the caster (CR 603.7d). */
export function reboundTrigger(exiled: ObjectId, caster: SeatId): DelayedTrigger {
  return { source: exiled, controller: caster, ability: REBOUND_ABILITY, subject: exiled };
}
