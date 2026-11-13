/**
 * Activating an activated ability (CR 602.2) as a transaction, like casting a spell (rules/cast.ts,
 * SPEC 17.1 A3). CR 602.2b says the process is that of CR 601.2b-i, so the steps are:
 *
 *   a. the ability is created on the stack as an object that is not a card   beginActivate (602.2a)
 *   b. the modes, if the ability is modal (CR 700.2a, D-114)                 the `chooseModes` decision
 *      (toActivationModes)
 *   b. the value of X, if the cost has an {X} or "pay X life"                 the `chooseX` decision
 *                                                                             (toActivationX, D-103)
 *   c. targets                                                                the `targets` decision
 *   f-h. costs: {T}, life, counters, "discard this card", then mana           payCosts
 *        (the `payMana` decision, shared with spells), then the sacrifice     payRest
 *        (the `choosePermanent` decision with `forCost`), then the cards to discard (the
 *        `chooseCards` decision with `forCost`, D-095), or for a crew cost the creatures to tap
 *        (the same decision with `purpose: 'crew'`, CR 702.122a)
 *   i. the ability becomes activated, its controller receives priority        finishActivation
 *
 * The whole pre-activation state is kept in the `CastingContext`, so `cancel` before the last cost
 * is paid restores it (CR 733). Once the activation finishes the costs are paid for good; the legal
 * actions never offer an ability whose cost cannot be paid (rules/activate-legality.ts).
 *
 * Abilities are found by their index among the object's derived abilities, so Cycling's expansion
 * (rules/derive.ts) is activated like any other.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { patchObject } from '../state/ops';
import type { ActivationContext, CastingContext, GameState, StackAbility } from '../state/types';
import { pushAbilityObject } from './ability-object';
import { adjustedAbility } from './activate-adjust';
import { answerBlightCost, payBlight } from './activate-blight';
import { answerBounceCommander, answerBounceCost, payBounce } from './activate-bounce';
import { breakDown, type CostBreakdown, costRefusal, payImmediateCosts } from './activate-costs';
import { activatedAbilitiesOf, activationRefusal } from './activate-legality';
import { activationExileDecision, exileChosen, exileCostCandidates } from './activation-exile';
import { becameTargetEvents } from './becomes-target';
import { crewCandidates, crewPowerOf, totalPower } from './crew';
import { discardCandidates, discardCostDecision, discardObjects } from './discard-cost';
import { targetSpecsOf } from './legality';
import { isLoyaltyAbility } from './loyalty';
import { payableSources } from './mana-engine';
import { legalModeSets, modalOfAbility, modesDecision, specModes } from './modes';
import { grantPriority } from './priority';
import { fail, ok, type Result } from './result';
import { sacrificeCandidates, sacrificePermanent, tapCandidates } from './sacrifice';
import { setPending } from './set-pending';
import { recordObjectsTogether } from './simultaneous';
import { sourceInfo } from './source-info';
import { targetChoiceSpecs } from './target-choice';
import { collectTriggers } from './triggers';
import { abilityXCost, hasX, largestPayableX } from './x-value';

/** The transaction in progress, with the ability's cost split by how it is paid. */
function inProgress(
  state: GameState,
): { casting: CastingContext; activation: ActivationContext; costs: CostBreakdown } | null {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return null;
  const costs = breakDown(activation.ability.cost, activation.x);
  return costs === null ? null : { casting, activation, costs };
}

/**
 * Stops the activation to ask a decision. What the costs paid so far triggered is noted now,
 * because these events are not scanned again (as in `continueResolution`).
 */
function pause(state: GameState, events: GameEvent[], decision: NewDecision): Result {
  return ok(setPending(collectTriggers(state, events), decision), events);
}

/** CR 602.2a: the ability goes on the stack first; then targets (CR 602.2b, 601.2c) and costs. */
export function beginActivate(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  abilityIndex: number,
): Result {
  const obj = state.objects[source];
  if (obj === undefined) return fail('That object is not in the game');
  const why = activationRefusal(state, seat, obj, abilityIndex);
  if (why !== null) return fail(why);
  const entry = activatedAbilitiesOf(state, obj).find((e) => e.abilityIndex === abilityIndex);
  if (entry === undefined) return fail('That object has no such activated ability');
  // D-135: the ability as it is paid for: amounts of life worked out, the reduction applied.
  const ability: StackAbility = adjustedAbility(state, seat, obj, entry.ability);

  const pushed = pushAbilityObject(state, { controller: seat, source, abilityIndex, ability });
  const casting: CastingContext = {
    seat,
    object: pushed.id,
    from: source,
    fromZone: obj.zone,
    stage: 'modes',
    totalCost: [],
    commanderTax: 0,
    activation: { source, abilityIndex, ability, x: 0 },
    snapshot: state,
  };
  return toActivationModes({ ...pushed.state, casting }, []);
}

/**
 * CR 602.2b, 601.2b, 700.2a (D-114): a modal ability's modes are chosen first, before X and the targets.
 * With exactly one legal choice the engine makes it; the legal actions never offer an ability with none.
 */
function toActivationModes(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return fail('No activation is in progress');
  const modal = modalOfAbility(activation.ability);
  if (modal === null) return toActivationX(state, events);
  const ctx = { controller: casting.seat, source: activation.source, stackObject: casting.object };
  const sets = legalModeSets(state, modal, ctx);
  const only = sets[0];
  if (only === undefined) return fail('That ability has no legal choice of modes');
  if (sets.length === 1) {
    const chosen = setChosenModes(state, casting.object, only);
    events.push({
      kind: 'modesChosen',
      seat: casting.seat,
      source: casting.object,
      modes: only,
      automatic: true,
    });
    return toActivationX(chosen, events);
  }
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'modes' } },
      modesDecision(
        state,
        casting.seat,
        casting.object,
        activation.source,
        'ability',
        modal,
        sets,
        ctx,
      ),
    ),
    events,
  );
}

/** Keeps the chosen modes on the spell or ability on the stack (CR 700.2, D-114). */
export function setChosenModes(
  state: GameState,
  object: ObjectId,
  modes: readonly number[],
): GameState {
  const stack = state.objects[object]?.stack;
  return stack ? patchObject(state, object, { stack: { ...stack, chosenModes: modes } }) : state;
}

/** CR 602.2b, 601.2b: X is announced before the targets are chosen (D-103). */
export function toActivationX(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return fail('No activation is in progress');
  const { seat } = casting;
  const ability = activation.ability;
  const perX = abilityXCost(ability.cost);
  if (!hasX(perX)) return toActivationTargets(state, events);
  // The largest X the player could pay for the whole cost, asked of the state before the ability
  // went on the stack, as the legal actions do.
  const before = casting.snapshot;
  const obj = before.objects[activation.source];
  if (obj === undefined) return fail('The source is gone');
  const max = largestPayableX((x) => costRefusal(before, seat, obj, ability.cost, x) === null);
  if (max === 0) return toActivationTargets(setX(state, 0), events);
  const info = sourceInfo(before, activation.source);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'x' } },
      {
        kind: 'chooseX',
        seat,
        source: casting.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'ability',
        min: 0,
        max,
        perX,
      },
    ),
    events,
  );
}

/** Keeps the announced X on the ability on the stack and in the activation (CR 602.2b). */
export function setX(state: GameState, x: number): GameState {
  const casting = state.casting;
  if (!casting?.activation) return state;
  const stack = state.objects[casting.object]?.stack;
  const withStack = stack ? patchObject(state, casting.object, { stack: { ...stack, x } }) : state;
  return { ...withStack, casting: { ...casting, activation: { ...casting.activation, x } } };
}

/**
 * CR 602.2b, 601.2c: the targets of the ability being activated, if it has any; otherwise on to the
 * costs. Run once X is known (or when the cost has none).
 */
export function toActivationTargets(state: GameState, events: GameEvent[] = []): Result {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  const object = casting === null ? undefined : state.objects[casting.object];
  if (!casting || !activation || object === undefined) return fail('No activation is in progress');
  // A modal ability has the targets of the modes chosen for it (CR 601.2c, 700.2c, D-114).
  const specs = targetSpecsOf(state, object);
  if (specs.length === 0)
    return payCosts({ ...state, casting: { ...casting, stage: 'targets' } }, events);
  // CR 601.2c: the source of the ability is the permanent; the ability itself never targets itself.
  const ctx = { controller: casting.seat, source: activation.source, stackObject: casting.object };
  const modal = modalOfAbility(activation.ability);
  return ok(
    setPending(
      { ...state, casting: { ...casting, stage: 'targets' } },
      {
        kind: 'targets',
        seat: casting.seat,
        source: casting.object,
        specs: targetChoiceSpecs(
          state,
          specs,
          ctx,
          modal === null ? undefined : specModes(modal, object.stack?.chosenModes ?? []),
        ),
      },
    ),
    events,
  );
}

/** The costs that need no mana and no choice, then mana (CR 601.2g-h), then the rest. */
export function payCosts(state: GameState, events: GameEvent[]): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation, costs } = going;
  if (state.objects[activation.source] === undefined) return fail('The source is gone');
  const paid = payImmediateCosts(state, casting.seat, activation.source, costs);
  events.push(...paid.events);
  if (costs.mana.length === 0) return payRest(paid.state, events);
  const next: GameState = {
    ...paid.state,
    casting: { ...casting, stage: 'payment', totalCost: costs.mana },
  };
  return pause(next, events, {
    kind: 'payMana',
    seat: casting.seat,
    source: casting.object,
    totalCost: costs.mana,
    manaSources: payableSources(next, casting.seat),
  });
}

/** The mana is paid (CR 601.2h): the sacrifice comes next, if the cost has one. */
export function afterManaPaid(state: GameState, events: GameEvent[]): Result {
  return payRest(state, events);
}

/**
 * The costs that need a choice (CR 118.3): the creatures to tap for a crew cost, the permanents to tap, the permanents to
 * sacrifice, then the cards to discard.
 */
function payRest(state: GameState, events: GameEvent[]): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { costs } = going;
  if (costs.tapCreatures !== null) return payCrew(state, events, costs.tapCreatures);
  if (costs.tapPermanents !== null) return payTap(state, events, costs.tapPermanents);
  return payBlight(state, events, paySacrifice);
}

/**
 * The tap cost (D-133, CR 118.3): the activating player taps `count` untapped permanents they control that match, before the
 * sacrifice and the discard. With exactly as many candidates the engine taps them (and says so); otherwise a
 * `choosePermanent` decision with `purpose: 'tap'` asks, and cancel rewinds the activation (CR 733).
 */
function payTap(
  state: GameState,
  events: GameEvent[],
  tap: { readonly filter: ObjectFilter; readonly count: number },
): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const legal = tapCandidates(state, casting.seat, activation.source, tap.filter);
  if (legal.length < tap.count) return fail('You cannot tap enough permanents');
  if (legal.length === tap.count) return tapChosen(state, events, legal, true);
  return pause({ ...state, casting: { ...casting, stage: 'tap' } }, events, {
    kind: 'choosePermanent',
    seat: casting.seat,
    source: casting.object,
    purpose: 'tap',
    min: tap.count,
    max: tap.count,
    legal,
    forCost: true,
  });
}

/** Taps the chosen permanents (CR 701.26a), then the cost goes on with the sacrifice. */
function tapChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  automatic: boolean,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  let next = state;
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects: chosen,
    purpose: 'tap',
    automatic,
  });
  for (const id of chosen) {
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id });
  }
  return payBlight(next, events, paySacrifice);
}

/** The answer to the tap question of a cost; the caller checked it against the decision's candidates and count. */
export function answerTapCost(state: GameState, chosen: readonly ObjectId[]): Result {
  if (state.casting?.activation == null || state.casting.stage !== 'tap') {
    return fail('No permanents are being chosen to tap for a cost');
  }
  return tapChosen({ ...state, pending: null }, [], chosen, false);
}

/** Remembers the permanents sacrificed to pay the ability's cost, for `sacrificedCost` (D-133). */
function rememberSacrificed(state: GameState, ids: readonly ObjectId[]): GameState {
  const object = state.casting?.object;
  const stack = object === undefined ? undefined : state.objects[object]?.stack;
  if (object === undefined || stack == null) return state;
  return patchObject(state, object, {
    stack: { ...stack, sacrificedAsCost: [...(stack.sacrificedAsCost ?? []), ...ids] },
  });
}

/**
 * The sacrifice cost (CR 701.21, 118.3), after the permanents were tapped, if the cost has one: "this" is sacrificed at
 * once; "a creature" (or "two artifacts") is chosen by the activating player with a `choosePermanent` decision unless
 * exactly as many qualify as are needed.
 */
function paySacrifice(state: GameState, events: GameEvent[]): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation, costs } = going;
  const seat = casting.seat;
  if (costs.sacrifice === null) return payBounce(state, events, payDiscard);
  if (costs.sacrifice === 'this') {
    const done = sacrificePermanent(state, activation.source, seat);
    if (done === null) return fail('The permanent you must sacrifice is gone');
    return payBounce(
      rememberSacrificed(done.state, [activation.source]),
      [...events, ...done.events],
      payDiscard,
    );
  }
  const legal = sacrificeCandidates(state, seat, activation.source, costs.sacrifice);
  if (legal.length < costs.sacrificeCount) {
    return fail(
      legal.length === 0 ? 'You have nothing to sacrifice' : 'You do not have enough to sacrifice',
    );
  }
  if (legal.length === costs.sacrificeCount) return sacrificeChosen(state, events, legal, true);
  return pause({ ...state, casting: { ...casting, stage: 'sacrifice' } }, events, {
    kind: 'choosePermanent',
    seat,
    source: casting.object,
    purpose: 'sacrifice',
    min: costs.sacrificeCount,
    max: costs.sacrificeCount,
    legal,
    forCost: true,
  });
}

/**
 * The crew cost (CR 702.122a): the activating player chooses untapped creatures they control, other
 * than the Vehicle, with total power N or greater, and they are tapped. With one candidate left the
 * engine chooses (and says so); otherwise a `choosePermanent` decision with `purpose: 'crew'` asks,
 * and cancel rewinds the activation (CR 733).
 */
function payCrew(state: GameState, events: GameEvent[], needed: number): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, activation } = going;
  const legal = crewCandidates(state, casting.seat, activation.source);
  if (totalPower(state, legal) < needed) return fail('You cannot crew: not enough total power');
  if (legal.length === 1) return crewChosen(state, events, legal, true);
  const powers: Record<ObjectId, number> = {};
  for (const id of legal) powers[id] = crewPowerOf(state, id);
  return pause({ ...state, casting: { ...casting, stage: 'crew' } }, events, {
    kind: 'choosePermanent',
    seat: casting.seat,
    source: casting.object,
    purpose: 'crew',
    min: 1,
    max: legal.length,
    legal,
    forCost: true,
    minTotalPower: needed,
    powers,
  });
}

/** Taps the chosen creatures (CR 702.122b: they "crew" the Vehicle), then the ability is activated. */
function crewChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  automatic: boolean,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  let next = state;
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects: chosen,
    purpose: 'crew',
    automatic,
  });
  for (const id of chosen) {
    next = patchObject(next, id, { tapped: true });
    events.push({ kind: 'tapped', object: id });
  }
  return finishActivation(next, events);
}

/**
 * The answer to the crew question of a cost. The caller checked it against the decision's legal
 * creatures; the total power is checked here, against the state the creatures are tapped in.
 */
export function answerCrewCost(state: GameState, chosen: readonly ObjectId[]): Result {
  const needed =
    state.casting?.activation == null
      ? null
      : breakDown(state.casting.activation.ability.cost, state.casting.activation.x)?.tapCreatures;
  if (needed == null || state.casting?.stage !== 'crew') {
    return fail('No creatures are being chosen for a crew cost');
  }
  if (totalPower(state, chosen) < needed) {
    return fail('Those creatures do not have enough total power to crew');
  }
  return crewChosen({ ...state, pending: null }, [], chosen, false);
}

function sacrificeChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
  automatic: boolean,
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  let next = state;
  events.push({
    kind: 'permanentsChosen',
    seat: casting.seat,
    source: casting.object,
    objects: chosen,
    purpose: 'sacrifice',
    automatic,
  });
  // D-283 (CR 603.10a): permanents sacrificed together as one cost keep the last-known information recorded before the first leaves.
  next = recordObjectsTogether(next, chosen);
  for (const id of chosen) {
    const done = sacrificePermanent(next, id, casting.seat, chosen.length > 1);
    if (done === null) return fail('That permanent cannot be sacrificed');
    next = done.state;
    events.push(...done.events);
  }
  return payBounce(rememberSacrificed(next, chosen), events, payDiscard);
}

/**
 * The discard cost (CR 701.9, 118.8; D-095): with exactly as many cards in hand as asked the engine
 * discards them all; with more, a `chooseCards` decision with `forCost` asks the activating player,
 * and `cancel` rewinds the activation (CR 733).
 */
function payDiscard(state: GameState, events: GameEvent[]): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, costs } = going;
  if (costs.discard === 0) return payExileCards(state, events);
  // The activation is an object on the stack whose `source` is the permanent with the ability (D-207: "another card named ~" is that permanent's name).
  const source = state.objects[casting.object]?.stack?.source ?? casting.object;
  const hand = discardCandidates(state, casting.seat, source, costs.discardOf);
  if (hand.length < costs.discard) return fail('You do not have enough cards to discard');
  if (hand.length === costs.discard) return discardChosen(state, events, hand);
  return pause(
    { ...state, casting: { ...casting, stage: 'discard' } },
    events,
    discardCostDecision(casting.seat, casting.object, hand, costs.discard, true),
  );
}

function discardChosen(state: GameState, events: GameEvent[], chosen: readonly ObjectId[]): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  const moved = discardObjects(state, casting.seat, chosen);
  if (moved === null) return fail('Those cards cannot be discarded');
  return payExileCards(moved.state, [...events, ...moved.events]);
}

/**
 * The exile cost (CR 118.3, 400.7; D-232): "Exile two creature cards from your graveyard". With exactly as many matching cards as asked the engine exiles them; with more, a
 * `chooseCards` decision with `forCost` asks the activating player, and `cancel` rewinds the activation (CR 733). The cards as they are in exile are remembered by the ability.
 */
function payExileCards(state: GameState, events: GameEvent[]): Result {
  const going = inProgress(state);
  if (!going) return fail('No activation is in progress');
  const { casting, costs } = going;
  if (costs.exileCards === null) return finishActivation(state, events);
  const source = state.objects[casting.object]?.stack?.source ?? casting.object;
  const legal = exileCostCandidates(state, casting.seat, source, costs.exileCards.filter);
  if (legal.length < costs.exileCards.count) {
    return fail('You do not have enough cards in your graveyard to exile');
  }
  if (legal.length === costs.exileCards.count) return exileCardsChosen(state, events, legal);
  return pause(
    { ...state, casting: { ...casting, stage: 'exile' } },
    events,
    activationExileDecision(casting.seat, casting.object, legal, costs.exileCards.count),
  );
}

function exileCardsChosen(
  state: GameState,
  events: GameEvent[],
  chosen: readonly ObjectId[],
): Result {
  const casting = state.casting;
  if (!casting) return fail('No activation is in progress');
  const moved = exileChosen(state, chosen);
  if (moved === null) return fail('Those cards cannot be exiled');
  const stack = moved.state.objects[casting.object]?.stack;
  const next =
    stack == null
      ? moved.state
      : patchObject(moved.state, casting.object, {
          stack: { ...stack, exiledAsCost: moved.exiled },
        });
  return finishActivation(next, [...events, ...moved.events]);
}

/** The answer to the exile question of a cost; the caller checked it against the decision. */
export function answerExileCost(state: GameState, chosen: readonly ObjectId[]): Result {
  if (state.casting?.activation == null || state.casting.stage !== 'exile') {
    return fail('No cards are being chosen to exile for a cost');
  }
  return exileCardsChosen({ ...state, pending: null }, [], chosen);
}

/** The answer to the discard question of a cost; the caller checked it against the decision. */
export function answerDiscardCost(state: GameState, chosen: readonly ObjectId[]): Result {
  if (state.casting?.activation == null || state.casting.stage !== 'discard') {
    return fail('No discard is being chosen for a cost');
  }
  return discardChosen({ ...state, pending: null }, [], chosen);
}

/** The answer to the sacrifice question of a cost; the caller checked it against the decision. */
export function answerSacrificeCost(state: GameState, chosen: readonly ObjectId[]): Result {
  if (state.casting?.activation == null || state.casting.stage !== 'sacrifice') {
    return fail('No sacrifice is being chosen for a cost');
  }
  return sacrificeChosen({ ...state, pending: null }, [], chosen, false);
}

/** The answer to the question of a blight cost (D-407, CR 701.68a): the creature gets the counters, then the sacrifice comes next. */
export function answerBlight(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerBlightCost(state, chosen, paySacrifice);
}

/** The answer to the question of a cost that returns permanents to their owners' hands (D-139); the discard comes next. */
export function answerReturnCost(state: GameState, chosen: readonly ObjectId[]): Result {
  return answerBounceCost(state, chosen, payDiscard);
}

/** The owner's answer to CR 903.9b for a commander that such a cost returns, then the rest of the cost (D-139). */
export function answerReturnCommander(
  state: GameState,
  object: ObjectId,
  toCommandZone: boolean,
): Result | null {
  return answerBounceCommander(state, object, toCommandZone, payDiscard);
}

/** CR 602.2b, 601.2i: the ability is activated; its controller receives priority (CR 117.3c). */
function finishActivation(state: GameState, events: GameEvent[]): Result {
  const casting = state.casting;
  const activation = casting?.activation ?? null;
  if (!casting || !activation) return fail('No activation is in progress');
  // CR 602.2b, 601.2c: the targets became targets as they were chosen.
  events.push(...becameTargetEvents(state, casting.object, casting.seat));
  const announced = state.objects[casting.object]?.stack?.x;
  events.push({
    kind: 'abilityActivated',
    seat: casting.seat,
    source: activation.source,
    abilityIndex: activation.abilityIndex,
    stackObject: casting.object,
    ...(announced == null ? {} : { x: announced }),
  });
  const next: GameState = {
    ...state,
    casting: null,
    pending: null,
    // D-139: "Activate only once each turn" reads this.
    turnLog: {
      ...state.turnLog,
      activated: [
        ...state.turnLog.activated,
        {
          object: activation.source,
          abilityIndex: activation.abilityIndex,
          // CR 606.3 (D-200): a loyalty ability of this permanent was activated this turn.
          ...(isLoyaltyAbility(activation.ability.cost) ? { loyalty: true as const } : {}),
        },
      ],
    },
    turn: { ...state.turn, passedInSuccession: [] },
  };
  const granted = grantPriority(next, casting.seat, events);
  return ok(granted.state, [...events, ...granted.events]);
}
