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
import type { ContinuousEffect, GameObject, GameState, TriggeredAbility } from '../state/types';
import { controlledSince, controllerOf } from './control';

/** The alternative cost a permanent remembers having been cast for, if it is one that matters on the battlefield. */
export function permanentAlternative(
  alt: NamedAlternativeKind | undefined,
): PermanentAlternativeKind | undefined {
  return alt === 'evoke' ||
    alt === 'dash' ||
    alt === 'escape' ||
    alt === 'bestow' ||
    alt === 'impending' ||
    alt === 'blitz'
    ? alt
    : undefined;
}

/**
 * CR 702.103b, 702.103d, 702.103f (Bestow; the rules text was not available to check these numbers): a spell cast for its bestow cost is an Aura enchantment spell, and a
 * permanent that entered from one is an Aura enchantment only while it is attached to a permanent; once it is unattached (or never was: its target was illegal as it resolved,
 * CR 702.103e) it is the creature its card is, for good.
 */
export function isBestowedAura(obj: GameObject): boolean {
  if (obj.zone === 'stack') return obj.stack?.alt === 'bestow' && obj.stack.ability == null;
  return obj.zone === 'battlefield' && obj.alt === 'bestow' && obj.attachedTo !== null;
}

/** The layer 4 effects of a bestowed Aura: no longer a creature, an Aura enchantment instead. */
export function bestowTypeEffects(obj: GameObject): readonly ContinuousEffect[] {
  return [
    {
      id: `bestow:${obj.id}:remove`,
      timestamp: obj.timestamp,
      objects: [obj.id],
      until: 'permanent',
      change: { kind: 'setTypes', remove: ['creature'] },
    },
    {
      id: `bestow:${obj.id}:aura`,
      timestamp: obj.timestamp,
      objects: [obj.id],
      until: 'permanent',
      change: { kind: 'setTypes', types: ['enchantment'], subtypes: ['Aura'], additive: true },
    },
  ];
}

/**
 * CR 702.176a (Impending): a permanent that entered from a spell cast for its impending cost is not a creature as long as it has a time
 * counter on it. A layer 4 effect with the permanent's own timestamp.
 */
export function isImpendingNotCreature(obj: GameObject): boolean {
  return obj.zone === 'battlefield' && obj.alt === 'impending' && (obj.counters.time ?? 0) > 0;
}

export function impendingTypeEffects(obj: GameObject): readonly ContinuousEffect[] {
  return [
    {
      id: `impending:${obj.id}:remove`,
      timestamp: obj.timestamp,
      objects: [obj.id],
      until: 'permanent',
      change: { kind: 'setTypes', remove: ['creature'] },
    },
  ];
}

/** CR 702.176a: "At the beginning of your end step, if this permanent's impending cost was paid and it has a time counter on it, remove a time counter from it." */
export const IMPENDING_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'you' },
  interveningIf: {
    kind: 'amountIs',
    amount: { kind: 'countersOn', of: { kind: 'this' }, counter: 'time' },
    compare: { cmp: 'atLeast', value: 1 },
  },
  effect: { kind: 'removeCounters', objects: { kind: 'this' }, counter: 'time', count: 1 },
};

/** CR 702.103b: a bestowed Aura has "enchant creature" (what its spell targets and what it may stay attached to). */
export const BESTOW_ENCHANT_ABILITY: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};

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
 * CR 702.152a (Blitz; the rules text was not available to check the number): "When this creature dies, draw a card": an ability of the permanent while `GameObject.alt` says
 * `blitz`, so a copy of the permanent (which has no `alt`, CR 707.2) and a permanent that lost its abilities (CR 613.1f) do not have it.
 */
export const BLITZ_DIES_ABILITY: Ability = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { kind: 'this' } },
  effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
};

/**
 * CR 702.152a: "Sacrifice it at the beginning of the next end step": the delayed triggered ability a resolving blitz spell creates, for the permanent it became. Like Dash's return it is
 * not an ability of the permanent (CR 603.7e): it happens even when the permanent has lost its abilities.
 */
export const BLITZ_SACRIFICE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'endStep', whose: 'each' },
  effect: { kind: 'sacrifice', objects: { kind: 'this' } },
};

/**
 * CR 603.7, 514.3a (Necromancy): "the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step": the delayed triggered ability a resolving spell
 * cast at a time a sorcery could not have been (`StackData.sacrificeAtCleanup`) creates, for the permanent it became. The permanent is sacrificed by whoever controls it then (CR 701.21a),
 * which need not be the spell's controller; like Dash's return it is not an ability of the permanent (CR 603.7e).
 */
export const FLASH_SACRIFICE_ABILITY: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'cleanupStep' },
  effect: { kind: 'sacrifice', objects: { kind: 'this' }, byController: true },
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
  if (isBestowedAura(obj)) return [BESTOW_ENCHANT_ABILITY];
  if (obj.alt === 'impending') return [IMPENDING_ABILITY];
  // CR 702.152a: a blitzed permanent has haste and "When this creature dies, draw a card".
  if (obj.alt === 'blitz') return [DASH_HASTE_ABILITY, BLITZ_DIES_ABILITY];
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

/**
 * CR 702.151b (Reconfigure): attaching an Equipment with reconfigure to a creature makes it stop being a creature until it becomes unattached. A permanent on the battlefield with the
 * keyword (read from its printed abilities, as for impending) that is attached to a permanent.
 */
export function isReconfigureNotCreature(obj: GameObject, printed: readonly Ability[]): boolean {
  return (
    obj.zone === 'battlefield' &&
    obj.attachedTo !== null &&
    printed.some((a) => a.kind === 'keyword' && a.keyword.kind === 'reconfigure')
  );
}

export function reconfigureTypeEffects(obj: GameObject): readonly ContinuousEffect[] {
  return [
    {
      id: `reconfigure:${obj.id}:remove`,
      timestamp: obj.timestamp,
      objects: [obj.id],
      until: 'permanent',
      change: { kind: 'setTypes', remove: ['creature'] },
    },
  ];
}
