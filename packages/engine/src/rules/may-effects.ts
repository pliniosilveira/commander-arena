/**
 * Effects of the "you may" family (D-135): the reflexive triggered ability of CR 603.12 ("When you do, ...") and the permission to
 * cast a card from the graveyard this turn.
 */
import type { Effect, Trigger } from '../ast/types';
import { allocateTimestamp, setObject } from '../state/ops';
import type {
  ChosenTarget,
  ContinuousEffect,
  DelayedTrigger,
  GameState,
  PendingTrigger,
  ResolutionContext,
  TriggeredAbility,
} from '../state/types';
import { runContinuous } from './continuous';
import { derive } from './derive';
import { playEnd } from './impulse';
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
  } else if (effect.afterPayment !== true && (res.performed ?? 0) <= 0) return done(state);
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
    // D-511 (CR 603.12, 700.2b): "When you do, choose one —": the modes are chosen as the reflexive ability goes on the stack (CR 603.3c).
    ...(effect.modes === undefined ? {} : { modes: effect.modes }),
    ...(effect.chooseModes === undefined ? {} : { chooseModes: effect.chooseModes }),
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
    // Issue 89 (CR 603.12, 400.7j): "When you do, return ... attached to that token": the objects this resolution made, fixed as the ability is created.
    ...(effect.carriesMoved === true ? { movedBefore: res.lastMoved ?? [] } : {}),
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
  // Issue 121 (Bloodthirsty Adversary): "exile up to that many target ...": a slot that takes up to as many targets as were paid is written as the bounds it has this time.
  const targets = effect.reflexive.targets?.map((spec) => {
    if (spec.upToTriggerAmount !== true) return spec;
    const { upToTriggerAmount: _fixed, ...rest } = spec;
    return { ...rest, min: 0, max: paid };
  });
  const ability: TriggeredAbility = {
    kind: 'triggered',
    trigger: REFLEXIVE_TRIGGER,
    ...(targets === undefined ? {} : { targets }),
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
  // Lorehold group 2 (CR 601.2, 118.9, 614.1a): "Choose target card exiled with this creature. You may cast that card this turn without paying its mana cost": a card in
  // exile, whoever owns it (the effect names it), is given a permission to be cast (never played as a land), free and with the library rider when the effect says so.
  const fromExile = effect.from === 'exile';
  const cards = resolveObjects(state, effect.objects, ctx, targets).filter((id) => {
    const card = state.objects[id];
    // Issue 159: "a creature card in a graveyard": a card of any player's graveyard; otherwise only the controller's ("from your graveyard").
    return fromExile
      ? card?.zone === 'exile'
      : card?.zone === 'graveyard' &&
          (effect.anyGraveyard === true || card.owner === res.controller);
  });
  let next = state;
  const created: ContinuousEffect[] = [];
  const delayed: DelayedTrigger[] = [];
  // CR 611.2a, 500.1 (Hildibrand Manderville): "until the end of your next turn" is the end of the controller's next turn, as `mayPlay` reads it.
  const until =
    effect.duration === 'untilEndOfNextTurn'
      ? playEnd(state, res.controller, 'endOfYourNextTurn')
      : 'endOfTurn';
  for (const id of cards) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    if (fromExile) {
      created.push({
        id: `ce${timestamp}`,
        timestamp,
        objects: [id],
        until: 'endOfTurn',
        change: {
          kind: 'playPermission',
          seat: res.controller,
          castOnly: true,
          ...(effect.free === true ? { free: true as const } : {}),
          ...(effect.bottomInstead === true ? { bottomInstead: true as const } : {}),
        },
      });
      continue;
    }
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until,
      change: {
        kind: 'castPermission',
        seat: res.controller,
        // CR 715.3 (Hildibrand Manderville): "cast it from your graveyard as an Adventure": the Adventure half only.
        ...(effect.adventure === true ? { adventureOnly: true as const } : {}),
        // D-359 (CR 614.1a): the rider of "If that spell would be put into your graveyard, exile it instead" goes with the permission.
        ...(effect.exileInstead === true ? { exileInstead: true as const } : {}),
        ...(effect.anyGraveyard === true ? { anyGraveyard: true as const } : {}),
      },
    });
    // Issue 159 (CR 603.7, 603.7a, 514.2): "When you cast it this turn, ...": a delayed triggered ability of the controller for a cast of this card, created now (the cast that
    // makes it is after it), triggers once and ends with the turn.
    const card = state.objects[id]?.card ?? null;
    if (effect.whenCast !== undefined && card !== null) {
      delayed.push({
        source: res.source,
        controller: res.controller,
        ability: {
          kind: 'triggered',
          trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
          effect: effect.whenCast,
        },
        untilEndOfTurn: true,
        watchedCard: card,
      });
    }
  }
  return done({
    ...next,
    continuousEffects: [...next.continuousEffects, ...created],
    delayedTriggers: [...next.delayedTriggers, ...delayed],
  });
}

/**
 * "You may cast Zombie spells from your graveyard this turn" (issue 159): one `castPermission` continuous effect for the controller that covers every card of their graveyard the
 * filter describes, until the end of the turn (CR 611.2a). No object is named, so a card that enters the graveyard later this turn is covered too (`legality.ts`, `grantsCast`).
 */
export function runMayCastSpells(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'mayCastSpells' }>,
): StepOutcome {
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [],
    until: 'endOfTurn',
    change: { kind: 'castPermission', seat: res.controller, spells: effect.spells },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/**
 * "This creature gains all activated abilities of that card until end of turn" (issue 159, CR 613.1f, 113.6, 611.2a): every activated and mana ability the card or spell `from`
 * has as the effect resolves (as it last was when it has left, CR 113.7a) is given to `to` until the end of the turn, in the order they are written. `to` must still be on the
 * battlefield (CR 608.2b). A copy of an ability keeps the text and the cost; the source is the permanent that has it now.
 */
export function runGainActivatedAbilitiesOf(
  state: GameState,
  effect: Extract<Effect, { kind: 'gainActivatedAbilitiesOf' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const [fromId] = resolveObjects(state, effect.from, ctx, targets);
  if (fromId === undefined) return done(state);
  const object = state.objects[fromId];
  const abilities =
    object !== undefined ? derive(state, object).abilities : (state.lki[fromId]?.abilities ?? []);
  const gained = abilities.filter((a) => a.kind === 'activated' || a.kind === 'mana');
  if (gained.length === 0) return done(state);
  return runContinuous(
    state,
    { kind: 'grantAbility', objects: effect.to, abilities: gained, duration: effect.duration },
    ctx,
    targets,
  );
}

/**
 * "Until end of turn, you may cast a spell from among those cards" (Locke, Treasure Hunter; CR 601.2, 611.2a, 400.7j): a `castPermission` for each card of the latest mill of this
 * resolution (`res.milledCards`) that is still in a graveyard, whoever owns it (`anyGraveyard`), until the end of the turn. The permissions share a key (`oneOf`), because the
 * effect allows one spell for all the cards: casting one uses up the rest (`rules/cast.ts`). A land card is no spell, so it is left out.
 */
export function runMayCastOneMilled(state: GameState, res: ResolutionContext): StepOutcome {
  const cards = (res.milledCards ?? []).filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      card.zone === 'graveyard' &&
      card.card !== null &&
      !derive(state, card).types.includes('land')
    );
  });
  let next = state;
  const created: ContinuousEffect[] = [];
  let key: string | undefined;
  for (const id of cards) {
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    key ??= `ce${timestamp}`;
    created.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [id],
      until: 'endOfTurn',
      change: { kind: 'castPermission', seat: res.controller, anyGraveyard: true, oneOf: key },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...created] });
}
