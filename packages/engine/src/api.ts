/**
 * The engine's public API (SPEC 4.2): `createGame`, `applyAction`, `getLegalActions`, `getView`.
 * The UI and the AI both use exactly this, so neither can make an illegal play or see hidden
 * information.
 */

import type { ObjectId, SeatId } from './ids';
import { legalActionsForDecision } from './legal-actions';
import type { ManaColor } from './mana/types';
import {
  answerCrewCost,
  answerDiscardCost,
  answerExileCost,
  answerReturnCommander,
  answerReturnCost,
  answerSacrificeCost,
  answerTapCost,
  beginActivate,
} from './rules/activate';
import { activationRefusal } from './rules/activate-legality';
import { isArrangement } from './rules/arrange';
import { acceptCascade, declineCascade } from './rules/cascade-cast';
import {
  answerCastDiscard,
  answerCastExile,
  answerCastSacrifice,
  answerCastTap,
  answerCostChoice,
  answerGiftChoice,
  answerKicker,
  answerKicks,
  answerModes,
  answerPayment,
  answerPayOptions,
  answerReplicas,
  answerTargets,
  answerX,
  beginCast,
  cancelCast,
} from './rules/cast';
import { acceptCastExiled, declineCastExiled } from './rules/cast-exiled-answer';
import { isLandCard } from './rules/cast-free';
import { acceptCastFree, declineCastFree } from './rules/cast-free-answer';
import { answerChangedTarget } from './rules/change-target-answer';
import { chosenFromOption } from './rules/chosen';
import {
  answerAttackers,
  answerAttackPayment,
  answerBlockers,
  answerBlockPayment,
  answerCombatReplacement,
  answerDamage,
} from './rules/combat-flow';
import { answerCopyTargets } from './rules/copy-spell-answer';
import {
  afterResolution,
  answerUntapChoice,
  discardCards,
  passPriority,
  resumeDrawStep,
} from './rules/flow';
import {
  applyGraveyardRider,
  graveyardPlayPermission,
  markGraveyardPlay,
  riderOf,
} from './rules/graveyard-play';
import { canPlayLand } from './rules/legality';
import { applyLegendRule } from './rules/legend-rule';
import { activateManaAbility } from './rules/mana-engine';
import { sameCombination } from './rules/mana-outcomes';
import { isLegalModeSet } from './rules/modes';
import { monarchAfterLoss } from './rules/monarch';
import { grantPriority } from './rules/priority';
import { fail, ok, type Result } from './rules/result';
import { evaluateGameEnd } from './rules/sba';
import { setPending } from './rules/set-pending';
import { bottomCards, keepHand, takeMulligan } from './rules/setup';
import { sharesLandType } from './rules/share-type';
import { answerSpecialPayment, beginSpecialAction } from './rules/special-actions';
import {
  answerResolutionArrange,
  answerResolutionCards,
  answerResolutionChoice,
  answerResolutionChooseOne,
  answerResolutionCommanderChoice,
  answerResolutionDevour,
  answerResolutionEntersChosen,
  answerResolutionEntersCopy,
  answerResolutionEntersPaid,
  answerResolutionOptional,
  answerResolutionPayAmount,
  answerResolutionReplacement,
  answerResolutionReselect,
  answerResolutionReveal,
  answerResolutionRiot,
  answerResolutionSearchMay,
  answerResolutionUnlessConfirm,
  answerResolutionUnlessPayment,
  continueResolution,
} from './rules/stack';
import type { PutResult } from './rules/trigger-stack';
import {
  answerTriggerModes,
  answerTriggerOrder,
  answerTriggerTargets,
} from './rules/trigger-stack';
import { answerResolutionVote } from './rules/vote-answer';
import { moveObject } from './rules/zones';
import type { Action } from './state/actions';
import type { PendingDecision, PriorityOption } from './state/decisions';
import type { GameEvent } from './state/events';
import { getObject, getSeat, patchSeat } from './state/ops';
import type { ChosenValues, GameState } from './state/types';

export { legalActionsForDecision };

export type ApplyResult = Result;

function sameColor(a: ManaColor | null, b: ManaColor | null): boolean {
  return a === b;
}

/** Two combinations of mana are the same in any order (CR 106.4); neither given is the same too. */
function sameChoice(
  a: readonly ManaColor[] | undefined,
  b: readonly ManaColor[] | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameCombination(a, b);
}

/** Every action `seat` may take now (SPEC 4.2). Empty when the seat is not the one deciding. */
export function getLegalActions(state: GameState, seat: SeatId): Action[] {
  const d = state.pending;
  if (state.result || d === null || d.seat !== seat) return [];
  return legalActionsForDecision(d);
}

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether the action is one of the priority options (activations compare by what they name). */
function isOffered(options: readonly PriorityOption[], action: Action): boolean {
  return options.some((o) => {
    if (o.kind === 'activateAbility') {
      return (
        action.kind === 'activateAbility' &&
        o.source === action.source &&
        o.abilityIndex === action.abilityIndex &&
        sameColor(o.color, action.color) &&
        sameChoice(o.combination, action.combination) &&
        o.sacrifice === action.sacrifice
      );
    }
    // A cast and a flashback cast of the same object are different plays (CR 118.9a), and so are
    // the casts of two faces of one card (CR 709.3, 712.11b, 715.3): a missing `face` is face 0.
    if (o.kind === 'castSpell') {
      return (
        action.kind === 'castSpell' &&
        o.object === action.object &&
        o.alternative === action.alternative &&
        (o.face ?? 0) === (action.face ?? 0)
      );
    }
    if (o.kind === 'playLand') {
      return (
        action.kind === 'playLand' &&
        o.object === action.object &&
        (o.face ?? 0) === (action.face ?? 0)
      );
    }
    if (o.kind === 'suspend' || o.kind === 'foretell') {
      return action.kind === o.kind && action.object === o.object;
    }
    if (o.kind === 'activate') {
      return (
        action.kind === 'activate' &&
        o.object === action.object &&
        o.abilityIndex === action.abilityIndex
      );
    }
    return sameAction(o as Action, action);
  });
}

function withCount(result: Result): Result {
  if (!result.ok) return result;
  return { ...result, state: { ...result.state, actionCount: result.state.actionCount + 1 } };
}

function playLand(
  state: GameState,
  seat: SeatId,
  object: ObjectId,
  entersPaid: boolean | null = null,
  face = 0,
  entersChosen: ChosenValues | null = null,
  entersRiot: readonly string[] = [],
  entersRevealed?: ObjectId,
): Result {
  const obj = getObject(state, object);
  if (!canPlayLand(state, seat, obj, face)) return fail('That land cannot be played now');
  // D-232: a land from the graveyard uses the permission of the permanent that gives it (once each turn).
  const graveyardUse =
    obj.zone === 'graveyard' ? graveyardPlayPermission(state, seat, obj, true) : null;
  // CR 305.1: playing a land is a special action that does not use the stack (CR 116.2a). A modal
  // double-faced card enters with the face the player chose up (CR 712.12).
  const moved = moveObject(state, {
    object,
    to: 'battlefield',
    toSeat: seat,
    entersPaid,
    entersChosen,
    face,
    ...(entersRiot.length === 0 ? {} : { entersRiot }),
    ...(entersRevealed === undefined ? {} : { entersRevealed }),
  });
  // CR 614.12, 614.12a: a land that asks "pay 2 life?" or "choose a creature type" as it enters waits for
  // the answer in the hand; the answer plays the land again with `entersPaid` or `entersChosen` set
  // (answerConfirm, answerChooseOption), and the same face.
  if (moved.kind === 'needsDecision') {
    const asked = moved.decision;
    const faced =
      (asked.kind === 'confirmOptional' ||
        asked.kind === 'chooseOption' ||
        asked.kind === 'chooseCards') &&
      face !== 0
        ? { ...asked, face }
        : asked;
    return ok(setPending(state, faced), []);
  }
  if (moved.newObject === null) return fail('The land could not be played');
  let next = patchSeat(moved.state, seat, {
    landsPlayedThisTurn: getSeat(moved.state, seat).landsPlayedThisTurn + 1,
  });
  if (graveyardUse !== null) {
    next = markGraveyardPlay(next, graveyardUse.object.id);
    next = applyGraveyardRider(next, moved.newObject, riderOf(graveyardUse, true));
  }
  const events: GameEvent[] = [
    ...moved.events,
    { kind: 'landPlayed', seat, object: moved.newObject, ...(face === 0 ? {} : { face }) },
  ];
  next = { ...next, pending: null, turn: { ...next.turn, passedInSuccession: [] } };
  const granted = grantPriority(next, seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}

function concede(state: GameState, seat: SeatId): Result {
  // CR 104.3a: a player can concede at any time and loses immediately.
  const next = patchSeat({ ...state, pending: null, casting: null, triggering: null }, seat, {
    hasLost: true,
  });
  const events: GameEvent[] = [
    { kind: 'conceded', seat },
    { kind: 'playerLost', seat, reason: 'concede' },
  ];
  // CR 725.4 (D-127): a monarch who concedes hands the designation on at once.
  const handed = monarchAfterLoss(next);
  events.push(...handed.events);
  const end = evaluateGameEnd(handed.state);
  events.push(...end.events);
  return ok(end.state, events);
}

function resumeAfterSbaDecision(state: GameState, prior: readonly GameEvent[] = []): Result {
  const granted = grantPriority(
    { ...state, pending: null },
    state.turn.prioritySeat ?? state.turn.activeSeat,
    prior,
  );
  return ok(granted.state, granted.events);
}

/** The commander on top of the active player's library that the draw step is drawing (CR 903.9b). */
function isDrawStepQuestion(
  state: GameState,
  d: Extract<PendingDecision, { kind: 'commanderZone' }>,
): boolean {
  return (
    state.resolution === null &&
    d.from === 'library' &&
    state.turn.step === 'draw' &&
    state.turn.activeSeat === d.seat &&
    state.seats[d.seat]?.library[0] === d.object
  );
}

function answerCommanderZone(
  state: GameState,
  d: Extract<PendingDecision, { kind: 'commanderZone' }>,
  move: boolean,
): Result {
  // D-139: a commander a cost returns to its owner's hand asks while the ability is being activated; that goes on with the cost.
  if (state.casting?.bounce !== undefined) {
    const paid = answerReturnCommander(state, d.object, move);
    if (paid !== null) return paid;
  }
  // A decision raised in the middle of a resolution (CR 903.9b) resumes that resolution.
  const resumed = answerResolutionCommanderChoice(state, d.object, move);
  if (resumed) {
    if (resumed.paused) return ok(resumed.state, resumed.events);
    const after = afterResolution(resumed.state, resumed.events);
    return ok(after.state, [...resumed.events, ...after.events]);
  }
  // The turn-based draw of the draw step (CR 504.1) asked about the commander it was drawing.
  if (isDrawStepQuestion(state, d)) {
    const r = resumeDrawStep(state, move);
    return ok(r.state, r.events);
  }
  // Otherwise it is the state-based action of CR 903.9a (704.6d).
  let next: GameState = { ...state, pending: null };
  const events: GameEvent[] = [];
  next = { ...next, commanderWatch: next.commanderWatch.filter((id) => id !== d.object) };
  if (move && next.objects[d.object]) {
    const moved = moveObject(next, { object: d.object, to: 'command' });
    if (moved.kind === 'done') {
      next = moved.state;
      events.push(...moved.events);
    }
  }
  const r = resumeAfterSbaDecision(next, events);
  return r.ok ? ok(r.state, [...events, ...r.events]) : r;
}

/** Continues a resolution after a decision it asked, then gives priority (CR 117.3b). */
function finishResolutionAnswer(resumed: ReturnType<typeof answerResolutionChoice>): Result {
  if (resumed === null) return fail('Nothing is waiting for that answer');
  if (resumed.paused) return ok(resumed.state, resumed.events);
  const after = afterResolution(resumed.state, resumed.events);
  return ok(after.state, [...resumed.events, ...after.events]);
}

/**
 * The answer to a confirmOptional decision. Six things ask it: the kicker question of a spell being
 * cast (CR 702.33a), the Ward question of a resolving ability (CR 702.21a), a "you may" ability on the stack
 * (CR 603.5, the head of the resolution queue is the question), a "may search" of a player an
 * effect names (CR 701.23a), a permanent entering during a
 * resolution that may pay to enter untapped (CR 614.12), and a land being played that may do so.
 */
function answerConfirm(
  state: GameState,
  seat: SeatId,
  d: Extract<PendingDecision, { kind: 'confirmOptional' }>,
  accept: boolean,
): Result {
  // CR 702.33a, 601.2b: "pay the kicker cost?" is asked while the spell is being cast.
  if (d.purpose === 'kicker') return answerKicker(state, accept);
  // CR 702.174a, 601.2b (D-135): "promise a gift to this opponent?" is asked while the spell is being cast.
  if (d.purpose === 'gift') return answerGiftChoice(state, accept);
  // CR 118.8, 601.2b (D-181): "sacrifice an artifact or creature or pay {4}": which way, asked while the spell is being cast.
  if (d.purpose === 'costChoice') return answerCostChoice(state, accept);
  // CR 702.21a: "pay [cost] or it is countered" (Ward), asked of the spell's controller as the
  // ability resolves.
  if (
    d.purpose === 'ward' ||
    d.purpose === 'counterUnlessPays' ||
    d.purpose === 'unlessPays' ||
    d.purpose === 'mayPay'
  ) {
    return finishResolutionAnswer(answerResolutionUnlessConfirm(state, accept));
  }
  // CR 702.85a, 608.2g (D-120): Cascade's "you may cast that card without paying its mana cost".
  if (d.purpose === 'cascade') {
    if (!accept) return finishResolutionAnswer(declineCascade(state));
    const begun = acceptCascade(state);
    return begun.ok ? begun : finishResolutionAnswer(declineCascade(state));
  }
  // CR 702.62a, 702.35a, 608.2g (D-128): "you may play it without paying its mana cost" (Suspend) and "its owner may
  // cast it by paying [cost]" (Madness): asked while the ability resolves.
  if (d.purpose === 'suspend' || d.purpose === 'madness') {
    if (!accept) return finishResolutionAnswer(declineCastExiled(state));
    const begun = acceptCastExiled(state);
    return begun.ok ? begun : finishResolutionAnswer(declineCastExiled(state));
  }
  // CR 608.2d, 701.23: "may search" is answered by the player who would search.
  if (d.purpose === 'search')
    return finishResolutionAnswer(answerResolutionSearchMay(state, accept));
  const head = state.resolution?.queue[0]?.kind;
  if (head === 'confirmOptional' || head === 'mayEffect' || head === 'playerMay') {
    return finishResolutionAnswer(answerResolutionOptional(state, accept));
  }
  if (state.resolution !== null) {
    return finishResolutionAnswer(answerResolutionEntersPaid(state, accept));
  }
  const played = playLand({ ...state, pending: null }, seat, d.source, accept, d.face ?? 0);
  if (!played.ok) return played;
  const answered: GameEvent = {
    kind: 'optionalAnswered',
    seat,
    source: d.source,
    accepted: accept,
  };
  return ok(played.state, [answered, ...played.events]);
}

/**
 * The answer to a chooseOption decision (CR 614.12a, D-100): "As this enters, choose a creature type /
 * a color". Asked while a permanent enters during a resolution (a spell becoming a permanent, an
 * effect putting one onto the battlefield, a token being created), or for a land being played.
 */
function answerChooseOption(
  state: GameState,
  seat: SeatId,
  d: Extract<PendingDecision, { kind: 'chooseOption' }>,
  option: string,
): Result {
  if (d.purpose === 'replacement') return answerReplacement(state, d, option);
  if (d.purpose === 'attackTarget') {
    // CR 508.7 (D-139): the attack target a creature is reselected to.
    if (!d.options.includes(option)) return fail('That is not one of the options');
    return finishResolutionAnswer(answerResolutionReselect(state, option));
  }
  if (d.purpose === 'effect') {
    // CR 608.2d (D-175): the instruction of a resolving effect that the controller chose among the ones it offered.
    if (!d.options.includes(option)) return fail('That is not one of the options');
    return finishResolutionAnswer(answerResolutionChooseOne(state, option));
  }
  if (d.purpose === 'vote') {
    // CR 701.38a (D-194): the vote of the player the decision is for.
    if (!d.options.includes(option)) return fail('That is not one of the options');
    return finishResolutionAnswer(answerResolutionVote(state, option));
  }
  if (d.purpose === 'riot') {
    // CR 702.136a (D-185): the counter or haste for an instance of riot, as the permanent enters.
    if (!d.options.includes(option)) return fail('That is not one of the options');
    if (state.resolution !== null)
      return finishResolutionAnswer(answerResolutionRiot(state, option));
    // A land played from the hand (a creature land that has riot) waits in the hand: it is played again with the answers.
    const played = playLand({ ...state, pending: null }, seat, d.source, null, d.face ?? 0, null, [
      ...(d.riotSoFar ?? []),
      option,
    ]);
    if (!played.ok) return played;
    const answered: GameEvent = {
      kind: 'optionChosen',
      seat,
      source: d.source,
      purpose: d.purpose,
      option,
    };
    return ok(played.state, [answered, ...played.events]);
  }
  const chosen = chosenFromOption(d.purpose, option, d.options);
  if (chosen === null) return fail('That is not one of the options');
  if (state.resolution !== null) {
    return finishResolutionAnswer(answerResolutionEntersChosen(state, option, chosen));
  }
  const played = playLand({ ...state, pending: null }, seat, d.source, null, d.face ?? 0, chosen);
  if (!played.ok) return played;
  const answered: GameEvent = {
    kind: 'optionChosen',
    seat,
    source: d.source,
    purpose: d.purpose,
    option,
  };
  return ok(played.state, [answered, ...played.events]);
}

/**
 * The answer to a replacement question (CR 616.1, D-191): the affected player chose which of several effects to apply first to a damage
 * event. The key must be one of the options. For damage dealt as a spell or ability resolves the instruction runs again with the answer; for
 * combat damage the batch carried by the decision is dealt again, and then priority goes to the active player (CR 510.3).
 */
function answerReplacement(
  state: GameState,
  d: Extract<PendingDecision, { kind: 'chooseOption' }>,
  option: string,
): Result {
  const choice = d.replacement?.choices.find((c) => c.option === option);
  if (d.replacement === undefined || choice === undefined || !d.options.includes(option)) {
    return fail('Choose one of the effects');
  }
  const chosen: GameEvent = {
    kind: 'replacementChosen',
    seat: d.seat,
    source: d.source,
    option,
    text: choice.text,
  };
  if (d.replacement.resume !== undefined) {
    const dealt = answerCombatReplacement(state, d.replacement.resume, option, chosen);
    return ok(dealt.state, dealt.events);
  }
  return finishResolutionAnswer(answerResolutionReplacement(state, option, chosen));
}

/** The answer to the mana payment of a Ward cost, then the rest of the resolution and priority. */
function answerWardPayment(state: GameState, action: Action): Result {
  if (action.kind !== 'payAuto' && action.kind !== 'payManual' && action.kind !== 'cancel') {
    return fail('Pay the cost or cancel');
  }
  const out = answerResolutionUnlessPayment(state, action);
  if (out !== null && 'error' in out) return fail(out.error);
  return finishResolutionAnswer(out);
}

/** CR 704.5j: the player keeps one; the others go to their graveyards, then state-based actions go on. */
function answerLegendRule(
  state: GameState,
  d: Extract<PendingDecision, { kind: 'choosePermanent' }>,
  chosen: readonly ObjectId[],
): Result {
  const keep = chosen[0];
  const applied = keep === undefined ? null : applyLegendRule(state, d, keep);
  if (applied === null) return fail('That is not a legal choice');
  const r = resumeAfterSbaDecision(applied.state, applied.events);
  return r.ok ? ok(r.state, [...applied.events, ...r.events]) : r;
}

/** CR 707.10c (D-129): the answer to the `targets` decision of the copy of a spell, then the rest of the resolution. */
function answerCopyTargetChoice(state: GameState, action: Action): Result {
  if (action.kind !== 'chooseTargets') return fail('Choose targets for the copy');
  const answered = answerCopyTargets(state, action.targets);
  if (answered === null) return fail('Nothing is waiting for that answer');
  if ('error' in answered) return fail(answered.error);
  return finishResolutionAnswer(answered);
}

/** CR 115.7a (D-181): the answer to the `targets` decision of a "change the target" effect, then the rest of the resolution. */
function answerChangeTargetChoice(state: GameState, action: Action): Result {
  if (action.kind !== 'chooseTargets') return fail('Choose the new target');
  const answered = answerChangedTarget(state, action.targets);
  if (answered === null) return fail('Nothing is waiting for that answer');
  if ('error' in answered) return fail(answered.error);
  return finishResolutionAnswer(answered);
}

/** CR 603.3b: the answer to an orderTriggers decision, then the rest of the triggers, then priority. */
function answerOrderTriggers(state: GameState, seat: SeatId, order: readonly number[]): Result {
  const put = answerTriggerOrder(state, seat, order);
  if (put === null) return fail('Order every trigger exactly once');
  return afterPutting(put);
}

/**
 * CR 603.3d: the answer to the `targets` decision of a triggered ability being put on the stack,
 * then the rest of the triggers, then priority. There is no cancel: it is not optional.
 */
function answerTriggerTargetChoice(state: GameState, action: Action): Result {
  if (action.kind !== 'chooseTargets') return fail('Choose targets for the triggered ability');
  const put = answerTriggerTargets(state, action.targets);
  if ('error' in put) return fail(put.error);
  return afterPutting(put);
}

/**
 * CR 603.3c, 700.2b: the answer to the `chooseModes` decision of a modal triggered ability being put on the
 * stack, then its targets, the rest of the triggers and priority. There is no cancel: it is not optional.
 */
function answerTriggerModeChoice(state: GameState, modes: readonly number[]): Result {
  const put = answerTriggerModes(state, modes);
  if ('error' in put) return fail(put.error);
  return afterPutting(put);
}

/** After triggers went on the stack: the next decision they need, or priority (CR 603.3b). */
function afterPutting(put: PutResult): Result {
  if (put.decision) return ok(setPending(put.state, put.decision), put.events);
  const granted = grantPriority(
    put.state,
    put.state.turn.prioritySeat ?? put.state.turn.activeSeat,
  );
  return ok(granted.state, [...put.events, ...granted.events]);
}

/** CR 608.2d: the chosen permanents must be legal and as many as the decision asks. */
function validPermanentChoice(
  chosen: readonly ObjectId[],
  d: Extract<PendingDecision, { kind: 'choosePermanent' }>,
): boolean {
  return (
    chosen.length >= d.min &&
    chosen.length <= d.max &&
    new Set(chosen).size === chosen.length &&
    chosen.every((id) => d.legal.includes(id))
  );
}

/** CR 701.23b, 701.9: distinct cards from the decision's list, between `min` and `max` of them. */
function validCardsChoice(
  chosen: readonly ObjectId[],
  d: Extract<PendingDecision, { kind: 'chooseCards' }>,
): boolean {
  // D-139: "discard two cards unless you discard an artifact card": exactly `max` cards, or one card of the list that alone will do.
  if (d.orSingle !== undefined && chosen.length !== d.max) {
    const [only] = chosen;
    if (chosen.length !== 1 || only === undefined || !d.orSingle.includes(only)) return false;
  }
  // CR 205.3i (D-262): "that share a land type": two or more cards need a land type that all of them have.
  if (d.shareLandType !== undefined && !sharesLandType(chosen, d.shareLandType)) return false;
  // CR 202.3 (D-230): "with total mana value 4 or less": the mana values of the cards chosen add up to no more than the limit.
  if (
    d.totalManaValue !== undefined &&
    chosen.reduce((n, id) => n + (d.totalManaValue?.values[id] ?? 0), 0) > d.totalManaValue.limit
  ) {
    return false;
  }
  return (
    chosen.length >= d.min &&
    chosen.length <= d.max &&
    new Set(chosen).size === chosen.length &&
    chosen.every((id) => d.legal.includes(id))
  );
}

export function applyAction(state: GameState, seat: SeatId, action: Action): ApplyResult {
  if (state.result) return fail('The game is over');
  const d = state.pending;
  if (d === null) return fail('The engine is not waiting for a decision');
  if (d.seat !== seat) return fail('It is not your decision');
  if (action.kind === 'concede') return withCount(concede(state, seat));

  const result = dispatch(state, seat, d, action);
  return withCount(resumeResolution(result));
}

/**
 * A spell cast as the effect of a resolving ability allows (CR 608.2g, Cascade, D-120) is cast without any
 * player receiving priority: once its last cost is paid the transaction is over and the resolution is still
 * there, with nothing pending. The resolution goes on, and only when it is over does a player receive priority,
 * with what the cast triggered on the stack (CR 603.3).
 */
function resumeResolution(result: Result): Result {
  if (!result.ok) return result;
  const s = result.state;
  if (s.resolution === null || s.casting !== null || s.pending !== null || s.result) return result;
  const out = continueResolution(s, [...result.events]);
  if (out.paused) return ok(out.state, out.events);
  const after = afterResolution(out.state, out.events);
  return ok(after.state, [...out.events, ...after.events]);
}

function dispatch(state: GameState, seat: SeatId, d: PendingDecision, action: Action): Result {
  switch (d.kind) {
    case 'priority': {
      if (!isOffered(d.options, action)) {
        // An activation that is not on offer says why (a cost it cannot pay, the wrong timing).
        if (action.kind === 'activate') {
          const obj = state.objects[action.object];
          const why = obj
            ? activationRefusal(state, seat, obj, action.abilityIndex)
            : 'That object is not in the game';
          return fail(`That is not a legal play now. ${why ?? ''}`.trim());
        }
        // A mana ability that is not on offer says why (a color it cannot make, a cost the pool
        // cannot pay); activating it does not change `state`.
        if (action.kind === 'activateAbility') {
          const why = activateManaAbility(
            state,
            seat,
            action.source,
            action.abilityIndex,
            action.color,
            action.combination ?? null,
            action.sacrifice,
          );
          if ('error' in why) return fail(`That is not a legal play now. ${why.error}`);
        }
        return fail('That is not a legal play now');
      }
      switch (action.kind) {
        case 'pass': {
          const r = passPriority(state, seat);
          return ok(r.state, r.events);
        }
        case 'playLand':
          return playLand(state, seat, action.object, null, action.face ?? 0);
        case 'castSpell':
          return beginCast(state, seat, action.object, action.alternative, action.face ?? 0);
        case 'suspend':
        case 'foretell':
          // CR 116.2f, 116.2h (D-128): a special action; it asks for its payment, then exiles the card.
          return beginSpecialAction(state, seat, action.kind, action.object);
        case 'activate':
          return beginActivate(state, seat, action.object, action.abilityIndex);
        case 'activateAbility': {
          const r = activateManaAbility(
            state,
            seat,
            action.source,
            action.abilityIndex,
            action.color,
            action.combination ?? null,
            action.sacrifice,
          );
          if ('error' in r) return fail(r.error);
          const next = {
            ...r.state,
            pending: null,
            turn: { ...r.state.turn, passedInSuccession: [] },
          };
          const granted = grantPriority(next, seat, r.events);
          return ok(granted.state, [...r.events, ...granted.events]);
        }
        default:
          return fail('That is not a priority action');
      }
    }
    case 'mulligan': {
      if (action.kind === 'keepHand') {
        const r = keepHand(state, seat);
        return ok(r.state, r.events);
      }
      if (action.kind === 'takeMulligan' && d.canMulligan) {
        const r = takeMulligan(state, seat);
        return ok(r.state, r.events);
      }
      return fail('Keep or take a mulligan');
    }
    case 'mulliganBottom': {
      if (action.kind !== 'chooseCards') return fail('Choose cards to put on the bottom');
      if (!validCardChoice(action.objects, d.hand, d.count))
        return fail('Choose exactly the number of cards asked');
      const r = bottomCards(state, seat, action.objects);
      return ok(r.state, r.events);
    }
    case 'discard': {
      if (action.kind !== 'chooseCards') return fail('Choose cards to discard');
      if (!validCardChoice(action.objects, d.hand, d.count))
        return fail('Choose exactly the number of cards asked');
      const r = discardCards({ ...state, pending: null }, seat, action.objects);
      return ok(r.state, r.events);
    }
    case 'targets': {
      // CR 707.10c (D-129): new targets for the copy of a spell a resolving spell or ability made; there is no cancel.
      if (d.forCopy === true) return answerCopyTargetChoice(state, action);
      // CR 115.7a (D-181): the new target of a spell or ability a resolving effect changes the target of; there is no cancel.
      if (d.forChange === true) return answerChangeTargetChoice(state, action);
      if (state.triggering !== null) return answerTriggerTargetChoice(state, action);
      if (action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'chooseTargets') return fail('Choose targets or cancel');
      return answerTargets(state, action.targets);
    }
    case 'payMana': {
      // CR 508.1h (D-125): the cost of attacking is paid before the attackers are declared; `cancel` takes the
      // declaration back.
      if (d.purpose === 'attackTax' && d.attacks !== undefined) {
        if (action.kind !== 'payAuto' && action.kind !== 'payManual' && action.kind !== 'cancel') {
          return fail('Pay the cost or cancel');
        }
        return answerAttackPayment(state, seat, d.attacks, action);
      }
      // CR 509.1d (D-149): the cost of blocking is paid before the blockers are declared; `cancel` takes the declaration back.
      if (d.purpose === 'blockTax' && d.blocks !== undefined) {
        if (action.kind !== 'payAuto' && action.kind !== 'payManual' && action.kind !== 'cancel') {
          return fail('Pay the cost or cancel');
        }
        return answerBlockPayment(state, seat, d.blocks, action);
      }
      // CR 702.62a, 702.143a (D-128): the cost of a special action, paid before the card is exiled.
      if (d.purpose === 'suspend' || d.purpose === 'foretell') {
        if (action.kind !== 'payAuto' && action.kind !== 'payManual' && action.kind !== 'cancel') {
          return fail('Pay the cost or cancel');
        }
        return answerSpecialPayment(state, seat, { ...d, purpose: d.purpose }, action);
      }
      // CR 702.21a: the mana of a Ward cost is paid while the ability resolves, not in a cast; there
      // `cancel` means "do not pay", which counters the spell or ability.
      if (
        d.purpose === 'ward' ||
        d.purpose === 'counterUnlessPays' ||
        d.purpose === 'unlessPays' ||
        d.purpose === 'mayPay'
      ) {
        return answerWardPayment(state, action);
      }
      if (action.kind === 'cancel') return cancelCast(state);
      if (action.kind === 'payAuto' || action.kind === 'payManual')
        return answerPayment(state, action);
      return fail('Pay the cost or cancel');
    }
    case 'commanderZone': {
      if (action.kind === 'moveToCommandZone') return answerCommanderZone(state, d, true);
      if (action.kind === 'declineCommandZone') return answerCommanderZone(state, d, false);
      return fail('Choose whether the commander goes to the command zone');
    }
    case 'choosePermanent': {
      // A sacrifice that is a cost of an activation can be taken back (CR 733) with `cancel`.
      if (d.forCost && action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'choosePermanents') return fail('Choose permanents');
      if (!validPermanentChoice(action.objects, d)) return fail('That is not a legal choice');
      // CR 701.34a (D-149): the players proliferated are among those the decision lists; no other choice names players.
      const players = action.players ?? [];
      if (
        players.length > 0 &&
        (d.purpose !== 'proliferate' ||
          new Set(players).size !== players.length ||
          !players.every((p) => d.players?.includes(p)))
      ) {
        return fail('That is not a legal choice');
      }
      // CR 502.3 (D-125): which of the permanents that may stay tapped untap, as the untap step begins.
      if (d.purpose === 'untap') {
        const out = answerUntapChoice(state, action.objects);
        return out === null ? fail('That is not a legal choice') : ok(out.state, out.events);
      }
      // CR 704.5j: the legend rule is a state-based action: no spell or ability is resolving.
      if (d.purpose === 'legendRule') return answerLegendRule(state, d, action.objects);
      // CR 702.122a: creatures tapped to pay a crew cost, with enough total power.
      if (d.purpose === 'crew') return answerCrewCost(state, action.objects);
      // D-133: the permanents tapped to pay "Tap three untapped Zombies you control".
      if (d.purpose === 'tap') {
        // D-149: the permanents a `tapPermanents` alternative cost of a spell taps are chosen as the spell is cast.
        return state.casting?.activation == null
          ? answerCastTap(state, action.objects)
          : answerTapCost(state, action.objects);
      }
      // D-139: the permanents returned to their owners' hands to pay "Return an artifact you control to its owner's hand".
      if (d.purpose === 'bounce') return answerReturnCost(state, action.objects);
      if (d.forCost) {
        // The sacrifice of a cost: of an ability being activated, or an additional cost of a spell.
        return state.casting?.activation == null
          ? answerCastSacrifice(state, action.objects)
          : answerSacrificeCost(state, action.objects);
      }
      // CR 614.1c / 707.9 (D-151): the creature an artifact enters as a copy of.
      if (d.purpose === 'entersCopy')
        return finishResolutionAnswer(answerResolutionEntersCopy(state, action.objects));
      // CR 702.82a (D-185): the creatures sacrificed as a permanent with devour enters.
      if (d.purpose === 'devour')
        return finishResolutionAnswer(answerResolutionDevour(state, action.objects));
      return finishResolutionAnswer(answerResolutionChoice(state, action.objects, players));
    }
    case 'chooseCards': {
      // A discard paid as a cost can be taken back (CR 733) with `cancel`, like a sacrifice.
      if (d.forCost === true && action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'chooseCards') return fail('Choose cards');
      if (!validCardsChoice(action.objects, d)) return fail('That is not a legal choice');
      if (d.forCost === true) {
        // CR 702.138a (D-124): the other cards an escape cost exiles are chosen as the spell is cast.
        if (d.purpose === 'exile') {
          // D-232: "Exile two creature cards from your graveyard" as the cost of an activated ability.
          return state.casting?.activation == null
            ? answerCastExile(state, action.objects)
            : answerExileCost(state, action.objects);
        }
        return state.casting?.activation == null
          ? answerCastDiscard(state, action.objects)
          : answerDiscardCost(state, action.objects);
      }
      // CR 608.2g (D-145): "You may cast a spell ... without paying its mana cost", "You may play the exiled card": none or one card.
      if (d.purpose === 'cast') {
        const [card] = action.objects;
        if (card === undefined) return finishResolutionAnswer(declineCastFree(state));
        // A land is played by the instruction; a spell is cast by the answer, as no player receives priority (CR 608.2g).
        if (isLandCard(state, card)) {
          return finishResolutionAnswer(answerResolutionCards(state, action.objects));
        }
        return acceptCastFree(state, card);
      }
      // CR 701.20a (D-225): the card revealed for a land's "you may reveal a Mountain or Plains card from your hand", chosen among several.
      if (d.purpose === 'reveal') {
        if (state.resolution !== null) {
          return finishResolutionAnswer(answerResolutionReveal(state, action.objects));
        }
        const [card] = action.objects;
        const played = playLand(
          { ...state, pending: null },
          seat,
          d.source,
          true,
          d.face ?? 0,
          null,
          [],
          card,
        );
        return played;
      }
      // Ward's discard (D-095) is chosen by the payer while the ward ability resolves.
      return finishResolutionAnswer(answerResolutionCards(state, action.objects));
    }
    case 'arrangeCards': {
      if (action.kind !== 'arrangeCards') return fail('Arrange the cards');
      // CR 701.22a, 701.25a: every card looked at is placed exactly once, and only in a pile the
      // decision has (a reorder has no second pile).
      if (!isArrangement(d.cards, d.piles, action.top, action.other)) {
        return fail('Place every card exactly once');
      }
      return finishResolutionAnswer(answerResolutionArrange(state, action.top, action.other));
    }
    case 'orderTriggers': {
      if (action.kind !== 'orderTriggers') return fail('Order the triggers');
      return answerOrderTriggers(state, seat, action.order);
    }
    case 'confirmOptional': {
      // The kicker question can be taken back, which rewinds the cast (CR 733).
      if (
        (d.purpose === 'kicker' || d.purpose === 'gift' || d.purpose === 'costChoice') &&
        action.kind === 'cancel'
      ) {
        return cancelCast(state);
      }
      if (action.kind === 'acceptOptional') return answerConfirm(state, seat, d, true);
      if (action.kind === 'declineOptional') return answerConfirm(state, seat, d, false);
      return fail('Accept or decline');
    }
    case 'chooseOption': {
      if (action.kind !== 'chooseOption') return fail('Choose one of the options');
      return answerChooseOption(state, seat, d, action.option);
    }
    case 'chooseX': {
      // CR 107.3a, 601.2b, 602.2b (D-103): X is announced as the spell is cast or the ability
      // activated; the announcement can be taken back, which rewinds it (CR 733).
      // D-151: "pay any amount of {R}" is asked while an ability resolves: there is no cast to take back.
      if ((d.purpose === 'payAnyAmount' || d.purpose === 'drawUpTo') && action.kind !== 'chooseX') {
        return fail('Choose how many');
      }
      if (action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'chooseX') return fail('Choose the value of X or cancel');
      if (!Number.isInteger(action.value) || action.value < d.min || action.value > d.max) {
        return fail(`X must be a whole number from ${d.min} to ${d.max}`);
      }
      // D-151: how many times to pay in "You may pay any amount of {R}".
      if (d.purpose === 'payAnyAmount' || d.purpose === 'drawUpTo') {
        // D-217: how many cards "may draw up to two cards" draws.
        return finishResolutionAnswer(answerResolutionPayAmount(state, action.value));
      }
      // CR 702.33c (D-110): the count of Multikicker is the same question with another answer.
      if (d.purpose === 'multikicker') return answerKicks(state, action.value);
      // CR 702.56a (D-129): the count of Replicate is asked the same way.
      if (d.purpose === 'replicate') return answerReplicas(state, action.value);
      return answerX(state, action.value);
    }
    case 'chooseModes': {
      // CR 601.2b, 602.2b, 700.2a (D-114): the modes are announced as the spell is cast or the ability
      // activated, and can be taken back (CR 733); a triggered ability's cannot (CR 603.3c).
      if (d.forTrigger !== true && action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'chooseModes') return fail('Choose modes');
      if (!isLegalModeSet(d.sets, action.modes)) return fail('That is not a legal choice of modes');
      if (d.forTrigger === true) return answerTriggerModeChoice(state, action.modes);
      return answerModes(state, action.modes);
    }
    case 'choosePayOptions': {
      // CR 601.2f-h, 702.51a, 702.126a, 702.66a (D-120): what is tapped or exiled for the cost of a spell being
      // cast; the choice can be taken back, which rewinds the cast (CR 733).
      if (action.kind === 'cancel') return cancelCast(state);
      if (action.kind !== 'choosePayOptions') return fail('Choose what to tap or exile, or cancel');
      return answerPayOptions(state, action.objects);
    }
    case 'declareAttackers': {
      if (action.kind !== 'declareAttackers') return fail('Declare attackers');
      return answerAttackers(state, seat, action.attacks);
    }
    case 'declareBlockers': {
      if (action.kind !== 'declareBlockers') return fail('Declare blockers');
      return answerBlockers(state, seat, action.blocks);
    }
    case 'assignDamage': {
      if (action.kind !== 'assignDamage') return fail('Assign combat damage');
      return answerDamage(state, d.step, action.assignments);
    }
    default: {
      const unreachable: never = d;
      return unreachable;
    }
  }
}

function validCardChoice(
  chosen: readonly ObjectId[],
  hand: readonly ObjectId[],
  count: number,
): boolean {
  return (
    chosen.length === count &&
    new Set(chosen).size === count &&
    chosen.every((id) => hand.includes(id))
  );
}
