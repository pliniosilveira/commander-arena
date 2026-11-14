/**
 * Casting a spell (CR 601.2) as a transaction (SPEC 17.1 A3, D-003).
 *
 *   a. the card moves to the stack, with the face       beginCast
 *      chosen for a split, Adventure or modal card
 *      face up (`rules/layouts.ts`)
 *   b. modes, additional and alternative costs, X      flashback and free ("without paying its mana
 *                                                       cost") are chosen with the action; modes are
 *                                                       asked first (answerModes), then kicker as a
 *                                                       `confirmOptional` (answerKicker) and X
 *                                                       (answerX); the additional costs of the face
 *                                                       are paid at h
 *   c. targets                                          answerTargets
 *   d. divide or distribute                             a slot with a `divide` total takes a `share`
 *                                                       for each target in the same answer as the
 *                                                       targets (rules/target-choice.ts, D-145)
 *   e. legality of the proposed spell                   canCast + answerTargets
 *   f. total cost: the mana cost (X generic mana for    spellCost (rules/cast-cost.ts), toPayment
 *      each {X}), the flashback cost or nothing
 *      (free), plus commander tax, kicker and
 *      additional costs, minus reductions (D-095)
 *      Convoke, Improvise and Delve (CR 702.51a,        askPayOptions, answerPayOptions
 *      702.126a, 702.66a): the caster chooses the       (rules/pay-options.ts, D-120)
 *      creatures to tap, artifacts to tap and cards
 *      to exile for the cost, which takes the mana
 *      they pay off it, before any mana is paid
 *   g. mana abilities, h. pay: the mana, then the       answerPayment, then
 *      sacrifice and the discard of the additional      payAdditionalCosts
 *      costs (rules/cast-additional.ts)
 *   i. the spell becomes cast                           finishCast
 *
 * The whole pre-cast state is kept in the CastingContext. Cancelling restores it, which is also how
 * an illegal cast is rewound (CR 733, Handling Illegal Actions).
 */
import type { ObjectId, SeatId } from '../ids';
import type { ManaColor, ManaRider } from '../mana/types';
import type { ChosenTarget } from '../state/chosen';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, getSeat, loseLifeBy, patchObject, patchSeat } from '../state/ops';
import type { GameState, PendingTrigger } from '../state/types';
import {
  afterManaPaid,
  payCosts,
  reduceForChosenTargets,
  setChosenModes,
  setX,
  toActivationTargets,
  toActivationX,
} from './activate';
import { planForActivation } from './activate-costs';
import { escalateCostOf, kickerCostOf, multikickerCostOf, replicateCostOf } from './alt-costs';
import { becameTargetEvents } from './becomes-target';
import {
  answerDiscard,
  answerExile,
  answerSacrifice,
  answerTap,
  payAdditionalCosts,
} from './cast-additional';
import {
  alternativeOfStack,
  type CastAlternative,
  type CastFrom,
  canPayRequest,
  canPaySpellCost,
  castAs,
  castManaPlan,
  isNamedAlternative,
  largestSpellX,
  spellCost,
  spellXCostOf,
} from './cast-cost';
import { answerGift, toGift } from './cast-gift';
import { leastAllowedX } from './cast-restrictions';
import { commanderCreatureTypes } from './commander-identity';
import { derive } from './derive';
import { graveyardPlayPermission, markGraveyardPlay, riderOf } from './graveyard-play';
import {
  canCast,
  canCastDuringResolution,
  castPermissionExiles,
  castTiming,
  castZone,
  faceOf,
  hasKickedTargets,
  libraryCastPermission,
  mayCastFromGraveyard,
  targetSpecsOf,
  targetsPossible,
} from './legality';
import { applyPaymentPlan, payableSources } from './mana-engine';
import { legalModeSets, modalOfSpellText, modesDecision, printedOrder, specModes } from './modes';
import { payByTapping } from './pay-manual';
import {
  colorsOfChoice,
  PAY_MECHANISMS,
  type PayMechanism,
  type PayOptionsBase,
  payMechanismsOf,
  payOptionSources,
  payOptionsAnswerOk,
  payOptionsDecision,
  remainders,
  usePayOptions,
} from './pay-options';
import { becomeUnprepared } from './prepare';
import { grantPriority } from './priority';
import { fail, ok, type Result } from './result';
import { sacrificeCandidates, tapCandidates } from './sacrifice';
import { setPending } from './set-pending';
import { sourceInfo } from './source-info';
import { maxTargetCountX, targetAnswerError, targetChoiceSpecs } from './target-choice';
import { payableSpellTargets } from './target-payable';
import { collectTriggers } from './triggers';
import { hasX, largestPayableX } from './x-value';
import { moveObject } from './zones';

export function beginCast(
  state: GameState,
  seat: SeatId,
  objectId: ObjectId,
  alternative?: CastAlternative,
  face = 0,
  /**
   * The spell is cast as the effect of a resolving ability allows (CR 608.2g, Cascade, D-120): from exile,
   * without paying its mana cost, with no timing restriction, and no player receives priority afterwards.
   */
  resolving = false,
  /** The spell is cast as the effect of its suspend ability (CR 702.62a, D-128): a creature spell gains haste. */
  suspended = false,
  /**
   * What the effect that lets the card be cast says about that one spell (D-350): `anyManaType` ("mana of any type can be spent to cast that spell", CR 609.4b) and
   * `exileInstead` ("If that spell would be put into a graveyard, exile it instead", CR 614.1a). With `resolving` and no alternative cost the spell is cast
   * paying its mana cost, from the graveyard it is in (`castCard`).
   */
  riders: { readonly anyManaType?: boolean; readonly exileInstead?: boolean } = {},
): Result {
  const obj = getObject(state, objectId);
  // CR 722.3c (D-214): the copy of a prepare spell is cast as its own face.
  if (obj.prepareOf !== undefined) face = obj.face;
  if (
    resolving
      ? !canCastDuringResolution(
          state,
          seat,
          obj,
          alternative === 'madness' || alternative === 'miracle'
            ? alternative
            : alternative === undefined
              ? 'normal' // D-350: cast as an effect allows, paying its mana cost
              : 'free',
          riders.anyManaType === true,
        )
      : !canCast(state, seat, obj, alternative, face)
  ) {
    return fail(
      alternative === 'flashback'
        ? 'That card cannot be cast with flashback now'
        : alternative === 'free'
          ? 'That card cannot be cast without paying its mana cost now'
          : alternative === undefined
            ? 'That spell cannot be cast now'
            : `That card cannot be cast for its ${alternative} cost now`,
    );
  }
  // D-145: a card cast as an effect allows is cast from where it is: exile (Cascade, Suspend, Madness, Hideaway) or the hand.
  const zone = resolving
    ? obj.zone === 'hand'
      ? 'hand'
      : obj.zone === 'graveyard'
        ? 'graveyard' // D-350: "cast target instant or sorcery card from a graveyard"
        : 'exile'
    : castZone(state, seat, obj, alternative, face);
  if (zone === null) return fail('That card is not in a zone it can be cast from');

  // CR 601.2a: move the card to the stack, with the chosen face up (CR 709.3, 712.11b, 715.3);
  // the caster becomes its controller.
  const graveyardUse =
    zone === 'graveyard' && !resolving && !mayCastFromGraveyard(state, seat, obj)
      ? graveyardPlayPermission(state, seat, obj, false)
      : null;
  const moved = moveObject(state, { object: objectId, to: 'stack', face });
  if (moved.kind !== 'done' || moved.newObject === null) return fail('The card could not move');
  const stackId = moved.newObject;
  // CR 722.3c, 601.2i (D-214): the prepared permanent loses the designation as the spell is cast (a cancelled cast restores the state before it).
  const unprepared =
    obj.prepareOf === undefined ? moved.state : becomeUnprepared(moved.state, obj.prepareOf);
  let next = patchObject(unprepared, stackId, {
    controller: seat,
    stack: {
      kind: 'spell',
      source: null,
      abilityIndex: null,
      ability: null,
      chosenTargets: [],
      x: null,
      chosenModes: [],
      castFromCommandZone: zone === 'command',
      castFrom: zone,
      kicked: false,
      flashback: alternative === 'flashback',
      ...(alternative === 'free' ? { free: true as const } : {}),
      ...(isNamedAlternative(alternative) ? { alt: alternative } : {}),
      ...(resolving && alternative !== 'madness' && alternative !== 'miracle'
        ? { byEffect: true as const }
        : {}),
      ...(suspended ? { suspended: true as const } : {}),
      // D-350: what the effect that let the card be cast says about this spell.
      ...(riders.anyManaType === true ? { anyManaType: true as const } : {}),
      // D-359: "You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead."
      ...(riders.exileInstead === true ||
      (zone === 'graveyard' && !resolving && castPermissionExiles(state, seat, obj))
        ? { exileInstead: true as const }
        : {}),
      // D-151: "If you cast a creature spell this way, it gains haste until end of turn".
      ...(zone === 'library' && libraryCastPermission(state, seat, obj)?.gainsHaste === true
        ? { hasteUntilEnd: true as const }
        : {}),
      // D-232: "Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped":
      // the card's own permission to be cast from the graveyard is used first; otherwise the permanent's, which is used up for this turn.
      ...(graveyardUse === null ? {} : { graveyardPlay: riderOf(graveyardUse, false) }),
    },
  });
  if (graveyardUse !== null) next = markGraveyardPlay(next, graveyardUse.object.id);
  // D-408 (CR 601.3b, 601.3d): a spell cast now only because of its own conditional flash ("if it targets a commander") chooses its targets from what meets it.
  // Read before the spell moves: the timing is that of the state it is cast in.
  const flashTargets = resolving
    ? null
    : castTiming(state, seat, castAs(obj, seat, face)).onlyTargets;
  // The cost, the kicker and the legality look at the face being cast only (CR 709.3a, 712.11c).
  const { tax } = spellCost(state, {
    seat,
    spell: castAs(obj, seat, face),
    zone,
    alternative,
    excluded: obj.id,
    kicked: false,
  });
  next = {
    ...next,
    casting: {
      seat,
      object: stackId,
      from: objectId,
      fromZone: zone,
      stage: 'modes',
      totalCost: [],
      commanderTax: tax,
      activation: null,
      snapshot: state,
      ...(resolving ? { duringResolution: true as const } : {}),
      ...(flashTargets === null ? {} : { flashTargets }),
    },
  };
  return toModes(next, [...moved.events]);
}

/**
 * CR 601.2b, 700.2a (D-114): a modal spell announces its modes first, before the kicker, X and the
 * targets. The legal sets are those whose modes all have legal targets; with exactly one the engine
 * chooses it, and `canCast` never offers a spell with none.
 */
function toModes(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const modal = modalOfSpellText(faceOf(state, spell)?.spell);
  if (modal === null) return toKicker(state, events);
  const ctx = { controller: casting.seat, source: casting.object };
  const sets = escalateAffordable(state, casting, legalModeSets(state, modal, ctx));
  const only = sets[0];
  if (only === undefined) return fail('That spell has no legal choice of modes');
  if (sets.length === 1) {
    events.push({
      kind: 'modesChosen',
      seat: casting.seat,
      source: casting.object,
      modes: only,
      automatic: true,
    });
    return toKicker(setChosenModes(state, casting.object, only), events);
  }
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'modes' } },
      modesDecision(state, casting.seat, casting.object, casting.object, 'spell', modal, sets, ctx),
    ),
    events,
  );
}

/**
 * CR 702.120a (D-145): with an escalate cost a set of modes is legal only if the caster could pay the total with its escalate cost (one
 * additional cost for each mode beyond the first); costs are read from the state before the cast began, as the kicker's are. Spells
 * without escalate keep every set.
 */
function escalateAffordable(
  state: GameState,
  casting: NonNullable<GameState['casting']>,
  sets: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  const before = casting.snapshot;
  const face = faceOf(before, getObject(state, casting.object));
  if (escalateCostOf(face) === null) return sets;
  const spell = castAs(
    getObject(before, casting.from),
    casting.seat,
    getObject(state, casting.object).face,
  );
  return sets.filter((set) =>
    canPayRequest(before, casting.seat, spell, {
      seat: casting.seat,
      spell,
      zone: casting.fromZone as CastFrom,
      alternative: alternativeOfStack(getObject(state, casting.object).stack),
      excluded: casting.from,
      kicked: false,
      modes: set.length,
    }),
  );
}

/**
 * The answer to the modes question of a spell or an activated ability (CR 601.2b, 602.2b, 700.2a): the
 * modes are kept on the object on the stack in printed order, then the cast goes on to the kicker, X and
 * the targets, the activation to X and the targets. The caller checked the set against the decision.
 */
export function answerModes(state: GameState, modes: readonly number[]): Result {
  const casting = state.casting;
  if (casting?.stage !== 'modes') return fail('No modes are being chosen');
  const chosen = printedOrder(modes);
  const next = setChosenModes({ ...state, pending: null }, casting.object, chosen);
  const events: GameEvent[] = [
    {
      kind: 'modesChosen',
      seat: casting.seat,
      source: casting.object,
      modes: chosen,
      automatic: false,
    },
  ];
  return casting.activation === null ? toKicker(next, events) : toActivationX(next, events);
}

/**
 * CR 601.2b: kicker is announced after the modes and before X and the targets. It is asked only when the
 * kicked total can be paid, so a player is never offered what the engine would then refuse. Costs are read
 * from the state before the cast began (`casting.snapshot`), with the card as it was.
 */
function toKicker(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const { seat } = casting;
  const before = casting.snapshot;
  const obj = getObject(before, casting.from);
  const stackObject = getObject(state, casting.object);
  const stack = stackObject.stack;
  if (!stack) return fail('The spell is not on the stack');
  const alternative = alternativeOfStack(stack);
  const zone = casting.fromZone as CastFrom;
  const spell = castAs(obj, seat, stackObject.face);
  const request = {
    seat,
    spell,
    zone,
    alternative,
    excluded: obj.id,
    modes: stack.chosenModes.length,
  } as const;
  const kickerCost = kickerCostOf(faceOf(before, spell));
  let asksKicker =
    kickerCost !== null && canPayRequest(before, seat, spell, { ...request, kicked: true });
  // CR 702.33g, 601.2c (D-181): a spell with targets that depend on the kicker is cast the way it has what it needs: the kicked way needs its
  // targets and its total cost, the unkicked way its own targets. With both possible the caster is asked; with one the cast goes that way.
  if (kickerCost !== null && hasKickedTargets(faceOf(before, spell))) {
    const overloaded = alternative === 'overload';
    const only = casting.flashTargets ?? null;
    const kickedOk = asksKicker && targetsPossible(before, seat, spell, overloaded, true, only);
    const unkickedOk =
      targetsPossible(before, seat, spell, overloaded, false, only) &&
      canPayRequest(before, seat, spell, { ...request, kicked: false });
    if (kickedOk && !unkickedOk) {
      return toReplicate(
        patchObject(state, casting.object, { stack: { ...stack, kicked: true } }),
        events,
      );
    }
    asksKicker = kickedOk && unkickedOk;
  }
  // CR 702.33c, 601.2b (D-110): Multikicker asks how many times, up to the most the whole cost could be paid.
  const multiCost = multikickerCostOf(faceOf(before, spell));
  const maxKicks =
    multiCost === null
      ? 0
      : largestPayableX((n) =>
          canPayRequest(before, seat, spell, { ...request, kicked: n > 0, kicks: n }),
        );
  const asksKicks = multiCost !== null && maxKicks >= 1;
  const next: GameState = {
    ...state,
    casting: { ...casting, stage: asksKicker || asksKicks ? 'kicker' : 'targets' },
  };
  if (asksKicker && kickerCost !== null) {
    const info = sourceInfo(next, casting.object);
    return ok(
      setPending(next, {
        kind: 'confirmOptional',
        seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        cost: kickerCost,
        purpose: 'kicker',
      }),
      events,
    );
  }
  if (asksKicks && multiCost !== null) {
    const info = sourceInfo(next, casting.object);
    return ok(
      setPending(next, {
        kind: 'chooseX',
        seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'multikicker',
        min: 0,
        max: maxKicks,
        perX: { mana: 0, life: 0 },
        cost: multiCost,
      }),
      events,
    );
  }
  return toReplicate(next, events);
}

/**
 * CR 702.56a, 601.2b (D-129): a spell with Replicate asks how many times its replicate cost is paid, after the kicker
 * and before X and the targets, up to the most the whole cost (with the kicker as it was answered) could be paid. Nothing
 * is asked when it cannot be paid even once. The answer is kept on the spell (`StackData.replicated`).
 */
function toReplicate(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const stack = spell.stack;
  if (!stack) return fail('The spell is not on the stack');
  const cost = replicateCostOf(faceOf(state, spell));
  if (cost === null) return toGift(state, events, toCostChoice);
  const before = casting.snapshot;
  const card = getObject(before, casting.from);
  const request = {
    seat: casting.seat,
    spell: castAs(card, casting.seat, spell.face),
    zone: casting.fromZone as CastFrom,
    alternative: alternativeOfStack(stack),
    excluded: card.id,
    kicked: stack.kicked,
    modes: stack.chosenModes.length,
    ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
  } as const;
  const max = largestPayableX((n) =>
    canPayRequest(before, casting.seat, request.spell, { ...request, replicas: n }),
  );
  if (max < 1) return toGift(state, events, toCostChoice);
  const info = sourceInfo(state, casting.object);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'kicker' } },
      {
        kind: 'chooseX',
        seat: casting.seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'replicate',
        min: 0,
        max,
        perX: { mana: 0, life: 0 },
        cost,
      },
    ),
    events,
  );
}

/**
 * CR 118.8, 601.2b (D-181): "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}": the caster announces which way
 * they pay, after the kicker, replicate and gift and before X and the targets. A way that could not be paid with the choices already made (the
 * kicker as it was answered) is not offered, and nothing is asked when only one can be paid. The answer is kept on the spell (`StackData.costOption`).
 */
function toCostChoice(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const stack = spell.stack;
  if (!stack) return fail('The spell is not on the stack');
  const choice = faceOf(state, spell)?.additionalCostChoice;
  if (choice === undefined) return toX(state, events);
  const before = casting.snapshot;
  const card = getObject(before, casting.from);
  const request = {
    seat: casting.seat,
    spell: castAs(card, casting.seat, spell.face),
    zone: casting.fromZone as CastFrom,
    alternative: alternativeOfStack(stack),
    excluded: card.id,
    kicked: stack.kicked,
    modes: stack.chosenModes.length,
    ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
    ...(stack.replicated === undefined ? {} : { replicas: stack.replicated }),
  } as const;
  const payable = ([0, 1] as const).filter((option) =>
    canPaySpellCost(
      before,
      casting.seat,
      request.spell,
      spellCost(before, { ...request, costOption: option }),
    ),
  );
  if (payable.length !== 2) {
    const only = payable[0] ?? 0;
    return toX(
      patchObject(state, casting.object, { stack: { ...stack, costOption: only } }),
      events,
    );
  }
  const info = sourceInfo(state, casting.object);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'kicker' } },
      {
        kind: 'confirmOptional',
        seat: casting.seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'costChoice',
        cost: choice[0],
        otherCost: choice[1],
      },
    ),
    events,
  );
}

/**
 * The answer to "pay the first additional cost, or the second?" (CR 118.8, 601.2b, D-181): accepting pays the first, declining the second; the cast
 * goes on to X and the targets.
 */
export function answerCostChoice(state: GameState, first: boolean): Result {
  const casting = state.casting;
  const d = state.pending;
  if (casting?.stage !== 'kicker' || d?.kind !== 'confirmOptional' || d.purpose !== 'costChoice') {
    return fail('No additional cost is being chosen');
  }
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: { ...stack, costOption: first ? 0 : 1 },
  });
  return toX(next, []);
}

/**
 * CR 601.2b, 107.3a (D-103): a spell with an {X} in its mana cost or "pay X life" announces X, after the
 * kicker and before the targets. The decision offers every value up to the largest the caster could pay
 * for the whole cost; when that is 0, or the spell has no X to announce (CR 107.3b: cast without paying
 * its mana cost, X is 0), nothing is asked.
 */
function toX(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const stack = spell.stack;
  if (!stack) return fail('The spell is not on the stack');
  const alternative = alternativeOfStack(stack);
  const perX = spellXCostOf(state, spell, alternative);
  if (!hasX(perX)) return toTargets(state, events);
  // D-386 (CR 601.2b-c): X is announced before the targets, so a slot of "X target ..." offers no X larger than the legal targets it has.
  const targetCap = maxTargetCountX(state, targetSpecsOf(state, spell), {
    controller: casting.seat,
    source: casting.object,
  });
  const max = Math.min(
    targetCap,
    largestSpellX(state, {
      seat: casting.seat,
      spell,
      zone: casting.fromZone as CastFrom,
      alternative,
      kicked: stack.kicked,
      ...(stack.kicks === undefined ? {} : { kicks: stack.kicks }),
      ...(stack.replicated === undefined ? {} : { replicas: stack.replicated }),
    }),
  );
  if (max === 0) {
    const zero = patchObject(state, casting.object, { stack: { ...stack, x: 0 } });
    return toTargets(zero, events);
  }
  const info = sourceInfo(state, casting.object);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'x' } },
      {
        kind: 'chooseX',
        seat: casting.seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'spell',
        // D-282 (CR 202.3e): "Your opponents can't cast spells with mana value 3 or less" takes the X that leaves the spell inside it out of the offer.
        min: Math.min(leastAllowedX(state, casting.seat, spell, true) ?? 0, max),
        max,
        perX,
      },
    ),
    events,
  );
}

/**
 * The answer to the X question of a spell or an activated ability (CR 601.2b, 602.2b): the value is
 * kept on the object on the stack (`StackData.x`), then the targets are chosen. The caller checked
 * the value against the decision's range.
 */
export function answerX(state: GameState, value: number): Result {
  const casting = state.casting;
  if (casting?.stage !== 'x') return fail('No X is being announced');
  const cleared: GameState = { ...state, pending: null };
  if (casting.activation !== null) return toActivationTargets(setX(cleared, value));
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  return toTargets(patchObject(cleared, casting.object, { stack: { ...stack, x: value } }), []);
}

/** CR 601.2c: choose targets, if the spell has any; otherwise on to the cost. */
function toTargets(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const seat = casting.seat;
  const object = getObject(state, casting.object);
  const x = object.stack?.x ?? 0;
  // D-386: a slot of "X target ..." with X = 0 has no target to choose; the spell is cast with none for it.
  const specs = targetSpecsOf(state, object).filter((spec) => spec.countX !== true || x > 0);
  if (specs.length === 0) return toPayment(state, events);
  const ctx = { controller: seat, source: casting.object };
  const modal = modalOfSpellText(faceOf(state, object)?.spell);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'targets' } },
      {
        kind: 'targets',
        seat,
        source: casting.object,
        specs: targetChoiceSpecs(
          state,
          specs,
          ctx,
          modal === null ? undefined : specModes(modal, object.stack?.chosenModes ?? []),
          x,
          // D-408: cast only by its own conditional flash ("if it targets a commander"): the targets are chosen from what meets it.
          casting.flashTargets ?? null,
          // D-1232: a cost that is cheaper for some targets is payable only with them: only those are offered.
          payableSpellTargets(state, casting, specs, ctx),
        ),
      },
    ),
    events,
  );
}

/**
 * The answer to "pay the kicker cost?" (CR 702.33a, 601.2b): the spell is kicked or not, then the
 * cast goes on to its targets. The answer has no event of its own; `spellCast` says `kicked`.
 */
export function answerKicker(state: GameState, kicked: boolean): Result {
  const casting = state.casting;
  if (casting?.stage !== 'kicker') return fail('No kicker cost is being asked');
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: { ...stack, kicked },
  });
  return toReplicate(next, []);
}

/**
 * The answer to "how many times to pay the multikicker cost?" (CR 702.33c, 601.2b): the count is kept on
 * the spell (`StackData.kicks`, and `kicked` for one or more), then the cast goes on to X and the targets.
 * The caller checked the value against the decision's range.
 */
export function answerKicks(state: GameState, value: number): Result {
  const casting = state.casting;
  if (casting?.stage !== 'kicker') return fail('No kicker count is being asked');
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: { ...stack, kicked: value > 0, ...(value > 0 ? { kicks: value } : {}) },
  });
  return toReplicate(next, []);
}

/**
 * The answer to "how many times to pay the replicate cost?" (CR 702.56a, 601.2b): the count is kept on the spell
 * (`StackData.replicated`, absent for none), then the cast goes on to X and the targets. The caller checked the value
 * against the decision's range.
 */
export function answerReplicas(state: GameState, value: number): Result {
  const casting = state.casting;
  if (casting?.stage !== 'kicker') return fail('No replicate count is being asked');
  const stack = getObject(state, casting.object).stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: { ...stack, ...(value > 0 ? { replicated: value } : {}) },
  });
  return toGift(next, [], toCostChoice);
}

/**
 * The answer to "promise a gift to this opponent?" (CR 702.174a, 601.2b, D-135): the opponent is kept on the spell, or the next
 * opponent is offered, then the cast goes on to X and the targets (`rules/cast-gift.ts`).
 */
export function answerGiftChoice(state: GameState, accept: boolean): Result {
  return answerGift(state, accept, toCostChoice);
}

/**
 * CR 601.2f: determine the total cost and lock it in, then ask for payment (CR 601.2g-h). The total
 * is the mana cost, the flashback cost instead of it (CR 118.9, 702.34a) or nothing (the `free`
 * alternative cost), plus commander tax, the kicker cost of a kicked spell (CR 702.33a) and the
 * additional costs of the face, minus the cost reductions (rules/cast-cost.ts, D-095). Life paid
 * (the kicker's, an additional `payLife`) is paid here (CR 119.4); the snapshot restores it if the
 * cast is cancelled. The sacrifice and the discard of the additional costs are paid after the mana
 * (`payAdditionalCosts`).
 */
function toPayment(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const spell = getObject(state, casting.object);
  const stack = spell.stack;
  const cost = spellCost(state, {
    seat: casting.seat,
    spell,
    zone: casting.fromZone as CastFrom,
    alternative: alternativeOfStack(stack),
    kicked: stack?.kicked === true,
    ...(stack?.kicks === undefined ? {} : { kicks: stack.kicks }),
    ...(stack?.replicated === undefined ? {} : { replicas: stack.replicated }),
    // CR 601.2f: the X announced at 601.2b is part of the cost determined here (D-103).
    x: stack?.x ?? 0,
  });
  const symbols = cost.symbols;
  let next: GameState = {
    ...state,
    casting: {
      ...casting,
      stage: 'payment',
      totalCost: symbols,
      extra: {
        sacrifice: cost.sacrifice,
        discard: cost.discard,
        exile: cost.exile,
        tap: cost.tap,
      },
    },
  };
  if (cost.life > 0) {
    const life = getSeat(next, casting.seat).life;
    next = loseLifeBy(next, casting.seat, cost.life);
    events.push({ kind: 'lifeChanged', seat: casting.seat, from: life, to: life - cost.life });
  }
  // CR 702.51b, 702.126b, 702.66b: Convoke, Improvise and Delve apply after the total cost is determined.
  return askPayOptions(next, events, payMechanismsOf(faceOf(next, spell)));
}

/**
 * CR 601.2f-h, 702.51a, 702.126a, 702.66a (D-120): the cost-payment keywords the spell has are asked one at a
 * time (convoke, improvise, delve), each only when something could be used for what is left of the cost; then
 * the mana is paid. What the creatures, artifacts and cards chosen did is taken off `casting.totalCost`
 * (`answerPayOptions`), so the mana payment that follows is for what is left.
 */
function askPayOptions(
  state: GameState,
  events: GameEvent[],
  left: readonly PayMechanism[],
): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  for (const [i, mechanism] of left.entries()) {
    const base = payOptionsDecision(
      state,
      casting.seat,
      casting.object,
      mechanism,
      casting.totalCost,
    );
    if (base === null) continue;
    const after = left.slice(i + 1);
    const asking = {
      ...state,
      casting: { ...casting, stage: 'payOptions' as const, optionsLeft: after },
    };
    const decision = withSuggestions(asking, base, after);
    // What the costs paid so far triggered (a creature tapped) goes on the stack once the spell is cast.
    return ok(setPending(collectTriggers(asking, events), decision), events);
  }
  return toMana(state, events);
}

/** What choosing `objects` does: the state after, the events, and the cost left; null if it cannot be done. */
function settlePayOptions(
  state: GameState,
  base: PayOptionsBase,
  objects: readonly ObjectId[],
  after: readonly PayMechanism[],
): { state: GameState; events: GameEvent[]; cost: string[] } | null {
  const casting = state.casting;
  if (!casting || !payOptionsAnswerOk(base, objects)) return null;
  const used =
    objects.length === 0 ? { state, events: [] } : usePayOptions(state, base.mechanism, objects);
  if (used === null) return null;
  const spell = getObject(used.state, casting.object);
  const options =
    objects.length === 0 ? [[...base.cost]] : remainders(base.cost, colorsOfChoice(base, objects));
  const sacrifice = casting.extra?.sacrifice ?? null;
  const more = payOptionSources(used.state, casting.seat, after);
  const extra = more.length === 0 ? undefined : more;
  // The first way the chosen resources can pay (colors first) that leaves a cost the other sources can pay.
  const cost = options.find(
    (o) =>
      castManaPlan(used.state, casting.seat, spell, o, sacrifice, extra, casting.extra?.tap) !==
      null,
  );
  return cost === undefined ? null : { state: used.state, events: used.events, cost };
}

/** How many sets near the suggested one are tried for the legal list (each asks the payment planner). */
const CHOICES_TRIED = 40;

/**
 * The decision with the answers an agent can rely on (`suggested`, `choices`): what the payment planner itself
 * would tap (the fewest resources, lands first), and sets near it, each leaving a cost the rest can pay. The
 * question is asked only when the cost could be paid, so there is always one.
 */
function withSuggestions(
  state: GameState,
  base: PayOptionsBase,
  after: readonly PayMechanism[],
): NewDecision {
  const casting = state.casting;
  const spell = casting === null ? null : getObject(state, casting.object);
  if (casting === null || spell === null) return { ...base, suggested: [], choices: [[]] };
  const index = -1 - PAY_MECHANISMS.indexOf(base.mechanism);
  const plan = castManaPlan(
    state,
    casting.seat,
    spell,
    base.cost,
    casting.extra?.sacrifice ?? null,
    payOptionSources(state, casting.seat, [base.mechanism, ...after]),
    casting.extra?.tap,
  );
  const planned = new Set(
    (plan?.taps ?? []).filter((t) => t.abilityIndex === index).map((t) => t.object),
  );
  // Always in the order the candidates are listed in, so the same sets are the same lists.
  const ordered = (set: readonly ObjectId[]): ObjectId[] =>
    base.candidates.filter((c) => set.includes(c));
  const works = (set: readonly ObjectId[]): boolean =>
    settlePayOptions(state, base, set, after) !== null;
  const seen = new Set<string>();
  const choices: ObjectId[][] = [];
  let tries = CHOICES_TRIED;
  const consider = (set: readonly ObjectId[]): boolean => {
    const sorted = ordered(set);
    const key = sorted.join(',');
    if (seen.has(key) || tries <= 0) return false;
    seen.add(key);
    tries -= 1;
    if (!works(sorted)) return false;
    choices.push(sorted);
    return true;
  };
  // Everything in mana first when that pays, then what the planner would tap, then its neighbours.
  consider([]);
  let suggested: ObjectId[] = ordered([...planned]);
  if (!consider(suggested) && !seen.has(suggested.join(','))) suggested = [];
  else if (!works(suggested)) suggested = [];
  if (choices.length === 0 || !choices.some((c) => c.join(',') === suggested.join(','))) {
    // The planner's set did not settle as expected: fall back to the first set that does.
    const first = choices[0];
    suggested = first === undefined ? [] : [...first];
  }
  for (const c of suggested) consider(suggested.filter((x) => x !== c));
  const others = base.candidates.filter((c) => !suggested.includes(c));
  for (const c of others) consider([...suggested, c]);
  for (const out of suggested)
    for (const inn of others) consider([...suggested.filter((x) => x !== out), inn]);
  return { ...base, suggested, choices };
}

/** The mana of what is left of the total cost (CR 601.2g-h): asked of the caster, or nothing to pay. */
function toMana(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const { optionsLeft: _left, ...rest } = casting;
  const next: GameState = { ...state, casting: { ...rest, stage: 'payment' } };
  if (casting.totalCost.length === 0) return afterMana(next, events);
  return ok(
    setPending(collectTriggers(next, events), {
      kind: 'payMana',
      seat: casting.seat,
      source: casting.object,
      totalCost: casting.totalCost,
      manaSources: payableSources(next, casting.seat),
    }),
    events,
  );
}

/**
 * The answer to a choosePayOptions decision (CR 601.2f-h): the chosen creatures or artifacts are tapped, or the
 * chosen cards exiled, and what they paid is taken off the cost. Which mana each creature paid is the way, among
 * those that pay every chosen resource, that covers the most colored mana and leaves a cost the mana payment can
 * pay (`remainders`). A choice that leaves a cost nothing can pay is refused: the cast could not be finished.
 */
export function answerPayOptions(state: GameState, objects: readonly ObjectId[]): Result {
  const casting = state.casting;
  const d = state.pending;
  if (casting?.stage !== 'payOptions' || d?.kind !== 'choosePayOptions') {
    return fail('Nothing is being tapped or exiled for the cost');
  }
  if (!payOptionsAnswerOk(d, objects)) return fail('Those cannot pay for that cost');
  const cleared: GameState = { ...state, pending: null };
  const left = casting.optionsLeft ?? [];
  const settled = settlePayOptions(cleared, d, objects, left);
  if (settled === null) return fail('That would leave a cost you cannot pay');
  const next: GameState = { ...settled.state, casting: { ...casting, totalCost: settled.cost } };
  return askPayOptions(next, settled.events, left);
}

/** The mana is paid (CR 601.2h): the sacrifice and the discard come next, then the spell is cast. */
function afterMana(state: GameState, events: GameEvent[]): Result {
  return payAdditionalCosts(state, events, finishCast);
}

/**
 * The answer to the sacrifice question of a spell's additional cost, and to its discard question:
 * the caller checked them against the decision. The rest of the costs, then the cast, follow.
 */
export function answerCastSacrifice(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerSacrifice(state, chosen, finishCast);
}

/** The answer to the question of which permanents a `tapPermanents` alternative cost taps (D-149). */
export function answerCastTap(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerTap(state, chosen, finishCast);
}

export function answerCastDiscard(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerDiscard(state, chosen, finishCast);
}

/** The answer to the question of which other cards an escape cost exiles (CR 702.138a, D-124). */
export function answerCastExile(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerExile(state, chosen, finishCast);
}

export function answerTargets(state: GameState, chosen: readonly ChosenTarget[]): Result {
  const casting = state.casting;
  const pending = state.pending;
  if (!casting || pending?.kind !== 'targets') return fail('No targets are being chosen');
  const refused = targetAnswerError(pending, chosen);
  if (refused !== null) return fail(refused);
  const obj = getObject(state, casting.object);
  const stack = obj.stack;
  if (!stack) return fail('The spell is not on the stack');
  const next = patchObject({ ...state, pending: null }, casting.object, {
    stack: { ...stack, chosenTargets: chosen },
  });
  // CR 602.2b: an activation goes on from the targets to its costs, a spell to its total cost.
  return casting.activation ? payCosts(reduceForChosenTargets(next), []) : toPayment(next, []);
}

export function answerPayment(
  state: GameState,
  action:
    | { kind: 'payAuto' }
    | {
        kind: 'payManual';
        taps: readonly { object: ObjectId; abilityIndex: number; color?: ManaColor | null }[];
      },
): Result {
  const casting = state.casting;
  if (!casting || state.pending?.kind !== 'payMana') return fail('No payment is being made');
  const seat = casting.seat;
  const spellObject = getObject(state, casting.object);
  const derivedSpell = derive(state, spellObject);
  const cleared: GameState = { ...state, pending: null };
  const activation = casting.activation;
  // An ability's cost is paid like a spell's, but restricted mana that may not pay for abilities
  // does not count (CR 106.6, 605.3a), and `finish` goes on to the rest of the cost.
  const spell = activation
    ? abilitySpend(state, activation.source)
    : {
        types: derivedSpell.types,
        subtypes: derivedSpell.subtypes,
        // D-351 (CR 609.4b): "mana of any type can be spent to cast that spell".
        ...(spellObject.stack?.anyManaType === true ? { anyType: true as const } : {}),
      };
  const sacrifice = casting.extra?.sacrifice ?? null;
  const tap = casting.extra?.tap;
  const finish = (s: GameState, events: GameEvent[]): Result => {
    if (activation) return afterManaPaid(s, events);
    // A payment by hand may have sacrificed the only permanent the additional cost could sacrifice
    // (a Treasure tapped for mana): the cast would be stuck, so the payment is refused.
    if (
      sacrifice !== null &&
      sacrificeCandidates(s, seat, casting.object, sacrifice).length === 0
    ) {
      return fail('That payment would leave nothing to sacrifice for the additional cost');
    }
    // D-149: nor may it tap the permanents the alternative cost still has to tap.
    if (tap != null && tapCandidates(s, seat, casting.object, tap.filter).length < tap.count) {
      return fail('That payment would leave too few permanents to tap for the cost');
    }
    return afterMana(s, events);
  };

  if (action.kind === 'payAuto') {
    // Keep colors other cards in hand need available (SPEC 10): reserve the colors of the hand.
    const plan = activation
      ? planForActivation(cleared, seat, activation)
      : castManaPlan(
          cleared,
          seat,
          spellObject,
          casting.totalCost,
          sacrifice,
          undefined,
          casting.extra?.tap,
        );
    if (plan === null) return fail('You cannot pay that cost');
    const applied = applyPaymentPlan(cleared, seat, plan, plan.lifePaid);
    return finish(
      withManaSpent(
        withSpentRiders(applied.state, casting, derivedSpell, applied.riders),
        casting,
        applied.spent,
        applied.spentSnow,
      ),
      applied.events,
    );
  }

  // Manual: activate the chosen mana abilities (CR 605.3b), then pay from the pool alone.
  const paid = payByTapping(cleared, seat, casting.totalCost, spell, action.taps);
  if ('error' in paid) return fail(paid.error);
  return finish(
    withManaSpent(
      withSpentRiders(paid.state, casting, derivedSpell, paid.riders),
      casting,
      paid.spent,
      paid.spentSnow,
    ),
    paid.events,
  );
}

/**
 * What mana may be spent on when it pays for an ability of `source` (CR 106.6, 605.3a; D-151: "... or activate abilities of Dragons" reads the card types and
 * subtypes of the permanent the ability belongs to). The permanent may have left while the cost was paid: then it names none.
 */
function abilitySpend(state: GameState, source: ObjectId) {
  const obj = state.objects[source];
  if (obj === undefined) return { ability: true } as const;
  const d = derive(state, obj);
  return { ability: true, source: { types: d.types, subtypes: d.subtypes } } as const;
}

/**
 * D-151: mana that carries a haste rider was spent on this spell: if the spell matches what the rider names, the permanent it becomes has haste until
 * end of turn (the spell remembers it). Nothing for an ability.
 */
function withSpentRiders(
  state: GameState,
  casting: NonNullable<GameState['casting']>,
  spell: {
    readonly types: readonly string[];
    readonly subtypes: readonly string[];
    readonly colors: readonly string[];
  },
  riders: readonly ManaRider[],
): GameState {
  if (casting.activation !== null) return state;
  const matches = (r: ManaRider): boolean => {
    if (r.types !== undefined && !spell.types.some((t) => r.types?.includes(t) === true)) {
      return false;
    }
    if (r.subtypes !== undefined && !spell.subtypes.some((t) => r.subtypes?.includes(t) === true)) {
      return false;
    }
    // D-328: "a red instant or sorcery spell": the spell is of one of the colors (CR 105.2: a colorless spell is of none).
    if (r.colors !== undefined && !spell.colors.some((c) => r.colors?.includes(c) === true)) {
      return false;
    }
    if (r.commander === true) {
      // CR 903.3 (D-229): the spell is a card its caster owns and designated as a commander.
      const card = state.objects[casting.object]?.card;
      const instance = card === null || card === undefined ? undefined : state.cards[card];
      if (instance === undefined || !instance.isCommander || instance.owner !== casting.seat) {
        return false;
      }
    }
    if (r.sharesTypeWithCommander === true) {
      // CR 205.3m: a creature type is shared when both have it; only a creature (or kindred) spell has creature types.
      const theirs = commanderCreatureTypes(state, casting.seat);
      return spell.subtypes.some((t) => theirs.has(t));
    }
    return true;
  };
  const stack = state.objects[casting.object]?.stack;
  let next = state;
  if (
    stack !== null &&
    stack !== undefined &&
    riders.some((r) => r.kind === 'haste' && matches(r))
  ) {
    next = patchObject(next, casting.object, { stack: { ...stack, hasteUntilEnd: true } });
  }
  // Group 4 of the Vraska deck (CR 603.2, 701.22): "When that mana is spent to cast a creature spell that shares a creature type with your commander,
  // scry 1." is a triggered ability of the permanent that made the mana, for each mana spent; it waits to go on the stack above the spell.
  const scries: PendingTrigger[] = [];
  for (const r of riders) {
    if (
      r.kind !== 'scry' ||
      (r.count === undefined && r.countCommanderCasts !== true) ||
      r.source === undefined ||
      !matches(r)
    )
      continue;
    scries.push({
      source: r.source,
      controller: casting.seat,
      abilityIndex: -1,
      ability: {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'you' },
        effect: {
          kind: 'scry',
          // D-229: "scry X, where X is the number of times it's been cast from the command zone": read as the scry resolves, for the spell.
          count:
            r.countCommanderCasts === true
              ? { kind: 'commanderCasts', of: 'triggerSubject' }
              : (r.count ?? 0),
        },
      },
      subject: r.countCommanderCasts === true ? casting.object : null,
    });
  }
  // D-328 (CR 106.6, 603.2, 603.7a, 707.10): "When that mana is spent to cast a red instant or sorcery spell, copy that spell": a triggered ability of the
  // permanent that made the mana, for each mana spent, which waits to go on the stack above the spell. The spell it copies is its subject (the spell
  // the mana was spent on, read from last-known information if it has left the stack, CR 113.7a), so the copy is put on the stack above the original.
  const copies: PendingTrigger[] = [];
  for (const r of riders) {
    if (r.kind !== 'copy' || r.source === undefined || !matches(r)) continue;
    copies.push({
      source: r.source,
      controller: casting.seat,
      abilityIndex: -1,
      ability: {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'endStep', whose: 'you' },
        effect: {
          kind: 'copySpell',
          spell: { kind: 'triggerSubject' },
          newTargets: r.newTargets ?? 'may',
        },
      },
      subject: casting.object,
    });
  }
  const triggers = [...scries, ...copies];
  return triggers.length === 0
    ? next
    : { ...next, pendingTriggers: [...next.pendingTriggers, ...triggers] };
}

/**
 * CR 601.2h (D-183): the spell remembers the mana spent to cast it, in all and by the card types of the sources that made it ("the amount of mana
 * spent to cast it", "for each mana from an artifact source spent to cast it", D-260: "for each {S} spent to cast this spell"). `spent` has one entry for each
 * mana, the source's card types; `spentSnow` is how many of them a snow source made.
 * Nothing for an ability, and nothing when no mana was spent.
 */
function withManaSpent(
  state: GameState,
  casting: NonNullable<GameState['casting']>,
  spent: readonly (readonly string[])[],
  spentSnow: number,
): GameState {
  const stack = state.objects[casting.object]?.stack;
  if (casting.activation !== null || spent.length === 0 || stack === null || stack === undefined) {
    return state;
  }
  const fromTypes: Record<string, number> = {};
  for (const types of spent) {
    for (const type of new Set(types)) fromTypes[type] = (fromTypes[type] ?? 0) + 1;
  }
  return patchObject(state, casting.object, {
    stack: {
      ...stack,
      manaSpent: {
        total: spent.length,
        fromTypes,
        // D-260: the mana from a snow source (CR 107.4h); left out when there was none, so a spell that was paid without snow keeps its shape.
        ...(spentSnow > 0 ? { snow: spentSnow } : {}),
      },
    },
  });
}

/** CR 601.2i: the spell becomes cast; the caster receives priority (CR 117.3c). */
function finishCast(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast in progress');
  const obj = getObject(state, casting.object);
  let next: GameState = { ...state, casting: null, pending: null };
  // CR 702.40a (D-129): the spell remembers how many spells were cast this turn before it (Storm counts them),
  // and now it is one of them. A copy of a spell is not cast and is not counted (CR 707.10).
  if (obj.stack !== null) {
    const before = next.seats.reduce((n, s) => n + s.spellsCastThisTurn, 0);
    next = patchObject(next, casting.object, { stack: { ...obj.stack, spellsCastBefore: before } });
    next = patchSeat(next, casting.seat, {
      spellsCastThisTurn: getSeat(next, casting.seat).spellsCastThisTurn + 1,
    });
  }
  if (obj.stack?.castFromCommandZone && obj.card !== null) {
    const card = obj.card;
    next = {
      ...next,
      commanderCasts: { ...next.commanderCasts, [card]: (next.commanderCasts[card] ?? 0) + 1 },
    };
  }
  // CR 601.2c: the spell's targets became targets as they were chosen; Ward and the like see it now.
  events.push(...becameTargetEvents(next, casting.object, casting.seat));
  const cast = alternativeOfStack(obj.stack);
  events.push({
    kind: 'spellCast',
    seat: casting.seat,
    object: casting.object,
    fromZone: casting.fromZone,
    commanderTax: casting.commanderTax,
    nth: getSeat(next, casting.seat).spellsCastThisTurn,
    ...(obj.stack?.kicked ? { kicked: true as const } : {}),
    ...(obj.stack?.kicks === undefined ? {} : { kicks: obj.stack.kicks }),
    ...(obj.stack?.replicated === undefined ? {} : { replicas: obj.stack.replicated }),
    ...(obj.stack?.giftTo === undefined ? {} : { gift: obj.stack.giftTo }),
    ...(cast === undefined ? {} : { alternative: cast }),
    ...(obj.face !== 0 ? { face: obj.face } : {}),
    ...(obj.stack?.x == null ? {} : { x: obj.stack.x }),
    ...(obj.stack?.suspended === true ? { suspended: true as const } : {}),
  });
  next = { ...next, turn: { ...next.turn, passedInSuccession: [] } };
  // CR 608.2g: a spell cast during resolution is the topmost object of the stack and no player receives
  // priority: the resolution goes on (rules/cascade-cast.ts hands it back), and what this cast triggered goes
  // on the stack once the resolution is over (CR 603.3).
  if (casting.duringResolution === true) return ok(next, events);
  const granted = grantPriority(next, casting.seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

/** Cancelling before payment completes restores the state from before the cast (A3, CR 733). */
export function cancelCast(state: GameState): Result {
  const casting = state.casting;
  if (!casting) return fail('No cast to cancel');
  // The snapshot restores the game, not the action log: the casting actions and this cancel were
  // all applied, so `actionCount` (the length of the log) keeps counting them.
  return ok({ ...casting.snapshot, actionCount: state.actionCount });
}
