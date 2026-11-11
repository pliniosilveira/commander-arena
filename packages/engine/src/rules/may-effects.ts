/**
 * Effects of the "you may" family (D-135): the reflexive triggered ability of CR 603.12 ("When you do, ...") and the permission to
 * cast a card from the graveyard this turn.
 */
import type { Effect, Trigger } from '../ast/types';
import { allocateTimestamp, setObject } from '../state/ops';
import type {
  ChosenTarget,
  ContinuousEffect,
  GameState,
  PendingTrigger,
  ResolutionContext,
  TriggeredAbility,
} from '../state/types';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/**
 * The text a reflexive triggered ability carries in place of an event: it has no event to match (CR 603.12: it triggers because
 * of what happened earlier in the resolution that created it), so nothing ever reads this; it only makes the ability a
 * `TriggeredAbility`, which the stack and the view treat like any other.
 */
const REFLEXIVE_TRIGGER: Trigger = { kind: 'step', step: 'endStep', whose: 'you' };

/**
 * CR 603.12: "When you do, [effect]". If the earlier part of this resolution did what its `may` offered (`res.performed` is more
 * than 0), a triggered ability controlled by the controller of this spell or ability is created at once. It waits in the list of
 * triggers that have triggered and goes on the stack the next time a player would receive priority (CR 603.3), with its targets
 * chosen then (CR 603.3d). It belongs to the source of the ability that created it (CR 603.7c: that object may be gone).
 */
export function runReflexive(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'reflexive' }>,
): StepOutcome {
  // CR 603.12 (D-231): "When one or more nonland cards are exiled this way": created when this resolution counted one, not when it merely did something.
  if (effect.ifThisWay !== undefined) {
    if ((res.thisWay?.[effect.ifThisWay] ?? 0) <= 0) return done(state);
  } else if ((res.performed ?? 0) <= 0) return done(state);
  // CR 603.12, 601.2c (D-187): "up to that many target creatures": the number is the permanents this resolution sacrificed, fixed now.
  const sacrificedCount = res.sacrificed?.length ?? 0;
  if (sacrificedCount === 0 && effect.targets?.some((spec) => spec.upToThatMany === true)) {
    return done(state);
  }
  const targets = effect.targets?.map((spec) => {
    if (spec.upToThatMany !== true) return spec;
    const { upToThatMany: _fixed, ...rest } = spec;
    return { ...rest, min: 0, max: sacrificedCount };
  });
  const ability: TriggeredAbility = {
    kind: 'triggered',
    trigger: REFLEXIVE_TRIGGER,
    ...(targets === undefined ? {} : { targets }),
    effect: effect.effect,
  };
  const pending: PendingTrigger = {
    source: res.source,
    controller: res.controller,
    abilityIndex: -1,
    ability,
    subject: null,
    // D-231: "put that many +1/+1 counters": what this resolution counted, fixed as the ability is created.
    ...(effect.ifThisWay === undefined || res.thisWay === undefined
      ? {}
      : { thisWayBefore: res.thisWay }),
    // D-177: "When you do, ... that creature's power": the permanents this resolution sacrificed, read from last-known information.
    ...(res.sacrificed === undefined || res.sacrificed.length === 0
      ? {}
      : { sacrificedBefore: res.sacrificed }),
  };
  return done({ ...state, pendingTriggers: [...state.pendingTriggers, pending] });
}

/**
 * The reflexive ability of "You may pay any amount of {R}. When you do, it deals that much damage" once the payment is made (D-151): a triggered ability of the
 * source of this one, created at once and put on the stack the next time a player would receive priority, with `paid` as its "that much" (`triggerDamage`).
 */
export function runPaidReflexive(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'payAnyAmount' }>,
): StepOutcome {
  const paid = effect.paid ?? 0;
  if (paid <= 0) return done(state);
  if (effect.ifPaid !== undefined) {
    // CR 608.2c, 107.3f (D-257): "If you do, draw X cards": the next instruction of this resolution, with X the number paid, which the resolving ability
    // now has (the same place the X announced for a spell or an activated ability is read from).
    const resolving = state.objects[res.object];
    const withX = resolving?.stack
      ? setObject(state, { ...resolving, stack: { ...resolving.stack, x: paid } })
      : state;
    return done(withX, [], [{ kind: 'effect', effect: effect.ifPaid }]);
  }
  if (effect.reflexive === undefined) return done(state);
  const ability: TriggeredAbility = {
    kind: 'triggered',
    trigger: REFLEXIVE_TRIGGER,
    ...(effect.reflexive.targets === undefined ? {} : { targets: effect.reflexive.targets }),
    effect: effect.reflexive.effect,
  };
  const pending: PendingTrigger = {
    source: res.source,
    controller: res.controller,
    abilityIndex: -1,
    ability,
    subject: null,
    damage: paid,
  };
  return done({ ...state, pendingTriggers: [...state.pendingTriggers, pending] });
}

/**
 * "You may cast target [card] from your graveyard this turn" (D-135): a `castPermission` continuous effect for each card of the
 * controller's graveyard the selector names, until the end of the turn (CR 611.2a). A target that is no longer in the graveyard it
 * was chosen in is skipped (CR 608.2b), and so is a card of another player's graveyard ("from your graveyard").
 */
export function runMayCast(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'mayCast' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const cards = resolveObjects(state, effect.objects, ctx, targets).filter((id) => {
    const card = state.objects[id];
    return card?.zone === 'graveyard' && card.owner === res.controller;
  });
  let next = state;
  const created: ContinuousEffect[] = [];
  for (const id of cards) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until: 'endOfTurn',
      change: { kind: 'castPermission', seat: res.controller },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...created] });
}
