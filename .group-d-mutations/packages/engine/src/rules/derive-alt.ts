/**
 * The abilities a permanent has because of the alternative cost its spell was cast for (D-121).
 *
 * CR 702.74a (Evoke): "When this permanent enters, if its evoke cost was paid, its controller sacrifices
 * it." The ability is the permanent's own (it functions on the battlefield) and exists only for a
 * permanent that entered from an evoked spell, so the intervening "if" is the ability's existence: it
 * is added by `derive` while `GameObject.alt` says `evoke`, and goes through the ordinary trigger
 * machinery (the stack, the order of the controller's triggers, last-known information).
 * `GameObject.alt` is the new object's own: any zone change makes a new object that was not evoked
 * (CR 400.7).
 *
 * CR 702.109a (Dash): "As long as this permanent's dash cost was paid, it has haste": a keyword ability
 * of the permanent while `GameObject.alt` says `dash` (so "loses all abilities" takes it away, CR 613.1f).
 * The other ability of a dashed creature, "return the permanent this spell becomes to its owner's hand at
 * the beginning of the next end step", is a delayed triggered ability of the spell, not of the permanent:
 * it is created as the spell resolves (`rules/stack.ts`) and kept in `GameState.delayedTriggers`, so it
 * still happens when the permanent has lost its abilities (CR 603.7e).
 */
import type { Ability, NamedAlternativeKind, PermanentAlternativeKind } from '../ast/types';
import type { GameObject, GameState, TriggeredAbility } from '../state/types';
import { controlledSince, controllerOf } from './control';

/** The alternative cost a permanent remembers having been cast for, if it is one that matters on the battlefield. */
export function permanentAlternative(
  alt: NamedAlternativeKind | undefined,
): PermanentAlternativeKind | undefined {
  return alt === 'evoke' || alt === 'dash' || alt === 'escape' ? alt : undefined;
}

/** CR 702.74a: "When this permanent enters, ... its controller sacrifices it." */
export const EVOKE_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
  effect: { kind: 'sacrifice', objects: { kind: 'this' } },
};

/** CR 702.109a: "As long as this permanent's dash cost was paid, it has haste." (CR 702.84a: unearth, too.) */
export const DASH_HASTE_ABILITY: Ability = { kind: 'keyword', keyword: { kind: 'haste' } };

/**
 * CR 702.109a: "return the permanent this spell becomes to its owner's hand at the beginning of the next
 * end step": the delayed triggered ability a resolving dash spell creates, for the permanent it became.
 */
export const DASH_RETURN_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
};

/**
 * CR 702.84a: "Exile it at the beginning of the next end step": the delayed triggered ability a resolving unearth
 * ability creates, for the permanent it returned (D-124). Like Dash's return it is not an ability of the
 * permanent (CR 603.7e).
 */
export const UNEARTH_EXILE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'exile', objects: { kind: 'this' } },
};

/**
 * The abilities the object has from its alternative cost or from unearth, appended after its printed ones and
 * their expansions. A returned-by-unearth permanent has haste (CR 702.84a "It gains haste").
 */
export function alternativeAbilitiesOf(state: GameState, obj: GameObject): readonly Ability[] {
  if (obj.alt === 'evoke')
    return obj.riotHaste === true ? [EVOKE_ABILITY, DASH_HASTE_ABILITY] : [EVOKE_ABILITY];
  // CR 702.62a (D-128, D-224): a creature cast by its suspend ability has haste "until you lose control of the spell or the permanent it becomes": while
  // the player who cast it (the controller it entered under) has controlled it without a break. Once another player controls it the haste is over, and it does
  // not come back when control does (`controlledSince` moves past the time it entered whenever control changed).
  // CR 702.136a (D-185): a creature that chose haste for an instance of riot has it.
  const suspendHaste =
    obj.alt === 'suspend' &&
    controllerOf(state, obj) === obj.controller && // stored controller: the player it entered under, who cast it
    controlledSince(state, obj) <= obj.timestamp;
  return obj.alt === 'dash' || obj.alt === 'unearth' || suspendHaste || obj.riotHaste === true
    ? [DASH_HASTE_ABILITY]
    : [];
}
