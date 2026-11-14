/**
 * The costs of an activated ability (CR 602.1a, 118): what they are, whether a player can pay them,
 * and paying the ones that need no choice and no mana.
 *
 * Activation announces X first, if the cost has one (CR 602.2b, 601.2b, D-103: an {X} in a mana cost
 * is X generic mana, "pay X life" is X life), and pays in this order (rules/activate.ts): targets
 * first (CR 602.2b, 601.2c), then
 *   1. the costs that need neither mana nor a choice: {T}, life, counters, "discard this card",
 *   2. mana, through the same `payMana` decision as a spell (CR 601.2g-h),
 *   3. the sacrifice, then the cards to discard (D-095): a source tapped for mana can still be
 *      sacrificed afterwards, or the creatures to tap for a crew cost (CR 702.122a), which stands
 *      alone in its ability's cost.
 * Paying {T} first keeps the payment planner from tapping the source for mana, which would leave
 * nothing to tap for the cost.
 *
 * The legality code (`canPayCosts`) runs exactly the same steps on a copy of the state, so an
 * ability the engine offers is one it can pay.
 */
import type { Cost, ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { PaymentPlan } from '../mana';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchObject } from '../state/ops';
import type { ActivationContext, GameObject, GameState } from '../state/types';
import { exileCostCandidates } from './activation-exile';
import { blightCandidates } from './blight-candidates';
import { controllerOf } from './control';
import { counterBlocked } from './counter-prevention';
import { crewRefusal } from './crew';
import { derive } from './derive';
import { discardCandidates } from './discard-cost';
import { discardOne } from './madness';
import { isSummoningSick, planFor } from './mana-engine';
import { millCards } from './mill';
import { controlledCandidates, sacrificeCandidates, tapCandidates } from './sacrifice';
import { withX } from './x-value';
import { moveObject } from './zones';

/** An activation cost split by how it is paid. */
export interface CostBreakdown {
  readonly tap: boolean;
  readonly life: number;
  readonly counters: readonly { readonly counter: string; readonly count: number }[];
  /** The loyalty symbol (D-200, CR 606.4): the change to the source's loyalty counters, with an X worked out, or null for no loyalty cost. */
  readonly loyalty: number | null;
  /** The counters put on the source as a cost (D-139, "Put a page counter on this artifact"). */
  readonly putCounters: readonly { readonly counter: string; readonly count: number }[];
  readonly discardThis: boolean;
  /** The card itself is exiled from the graveyard (D-185, CR 702.141a: the cost of Encore) or, since D-229, the permanent from the battlefield ("Exile this artifact"). */
  readonly exileThis: boolean;
  /** "Mill a card" as the cost of an ordinary ability (D-229, CR 701.17, 118.3): the top cards of the library, none when 0. */
  readonly mill: number;
  /** The discard of the card itself pays a cycling ability (CR 702.29c, D-179): the card is cycled, which triggers "when you cycle this card". */
  readonly cycling: boolean;
  /** How many cards to discard from the hand, chosen by the player (CR 701.9, D-095); 0 for none. */
  readonly discard: number;
  /** "Discard a legendary card" / "another card named ~" (D-207): what narrows the cards that may be discarded, or null for any. */
  readonly discardOf: Pick<Extract<Cost, { kind: 'discard' }>, 'filter' | 'named'> | null;
  /** The mana symbols of every `mana` cost, in order. */
  readonly mana: readonly string[];
  /** The permanents to sacrifice: the source itself, or a choice among a filter's matches. */
  readonly sacrifice: 'this' | ObjectFilter | null;
  /** How many of them (D-133, "Sacrifice two artifacts"; D-1424, "Sacrifice X creatures": the X announced, 0 for none); 1 for the source and for an ordinary cost. */
  readonly sacrificeCount: number;
  /** The permanents to return to their owners' hands (D-139): the source itself, or a choice among a filter's matches; null for none. */
  readonly bounce: 'this' | ObjectFilter | null;
  /** How many of them; 1 for the source and for an ordinary cost. */
  readonly bounceCount: number;
  /** "Exile two creature cards from your graveyard" (D-232): the cards of the graveyard the cost exiles, or null for none. */
  readonly exileCards: { readonly filter: ObjectFilter; readonly count: number } | null;
  /** The untapped permanents to tap (D-133, "Tap three untapped Zombies you control"), or null. */
  readonly tapPermanents: { readonly filter: ObjectFilter; readonly count: number } | null;
  /** The total power of the untapped creatures to tap (CR 702.122a, Crew), or null. */
  readonly tapCreatures: number | null;
  /** "Blight 1" (D-407, CR 701.68): the -1/-1 counters put on a creature the player controls, none when 0. */
  readonly blight: number;
}

/**
 * Splits `costs`, with `x` the value announced for an {X} and "pay X life" in them (CR 107.3a, 602.2b).
 * Null when a cost is one the engine does not run (`SUPPORTED_FEATURES.costKinds`),
 * when there is more than one sacrifice, discard or creature-tapping cost, or when creature
 * tapping is combined with mana, a sacrifice or a discard (the payment order cannot promise the
 * creatures are still there): such an ability is never offered.
 */
export function breakDown(costs: readonly Cost[], x = 0): CostBreakdown | null {
  let tap = false;
  let life = 0;
  let discardThis = false;
  let exileThis = false;
  let mill = 0;
  let cycling = false;
  let discard = 0;
  let discards = 0;
  let discardOf: CostBreakdown['discardOf'] = null;
  let sacrifice: CostBreakdown['sacrifice'] = null;
  let sacrificeCount = 1;
  let sacrifices = 0;
  let bounce: CostBreakdown['bounce'] = null;
  let bounceCount = 1;
  let bounces = 0;
  let exileCards: CostBreakdown['exileCards'] = null;
  let exileCardsCosts = 0;
  let tapPermanents: CostBreakdown['tapPermanents'] = null;
  let tapPermanentsCosts = 0;
  let tapCreatures: number | null = null;
  let tapCreaturesCosts = 0;
  let blight = 0;
  let blightCosts = 0;
  let loyalty: number | null = null;
  let loyaltyCosts = 0;
  const mana: string[] = [];
  const counters = new Map<string, number>();
  const put = new Map<string, number>();
  for (const cost of costs) {
    switch (cost.kind) {
      case 'tap':
        tap = true;
        break;
      case 'payLife':
        // D-135: an amount that reads the game was worked out as the ability was activated (`rules/activate-adjust.ts`).
        life += typeof cost.amount === 'number' ? cost.amount : 0;
        break;
      case 'payXLife':
        life += x;
        break;
      case 'removeCounters':
        counters.set(cost.counter, (counters.get(cost.counter) ?? 0) + cost.count);
        break;
      case 'loyalty':
        loyaltyCosts += 1;
        // CR 107.3a, 606.4: "[-X]" removes X counters, the X announced for the ability.
        loyalty = cost.change === 'x' ? -x : cost.change;
        break;
      case 'putCounters':
        put.set(cost.counter, (put.get(cost.counter) ?? 0) + cost.count);
        break;
      case 'returnToHand':
        bounces += 1;
        bounce = 'kind' in cost.what ? 'this' : cost.what;
        bounceCount = cost.count ?? 1;
        break;
      case 'discardThis':
        discardThis = true;
        if (cost.cycling === true) cycling = true;
        break;
      case 'exileThis':
        exileThis = true;
        break;
      case 'mill':
        mill += cost.count;
        break;
      case 'discard':
        discards += 1;
        discard += cost.count;
        if (cost.filter !== undefined || cost.named !== undefined) {
          discardOf = {
            ...(cost.filter === undefined ? {} : { filter: cost.filter }),
            ...(cost.named === undefined ? {} : { named: true as const }),
          };
        }
        break;
      case 'mana':
        mana.push(...withX(cost.symbols, x));
        break;
      case 'sacrifice':
        sacrifices += 1;
        sacrifice = 'kind' in cost.what ? 'this' : cost.what;
        // D-1424 (CR 107.3a, 602.2b): "Sacrifice X creatures" is X permanents, the X announced for the ability (none for X = 0).
        sacrificeCount = cost.countX === true ? x : (cost.count ?? 1);
        break;
      case 'exileFromGraveyard':
        exileCardsCosts += 1;
        exileCards = { filter: cost.filter, count: cost.count };
        break;
      case 'tapPermanents':
        tapPermanentsCosts += 1;
        tapPermanents = { filter: cost.filter, count: cost.count };
        break;
      case 'tapCreatures':
        tapCreaturesCosts += 1;
        tapCreatures = cost.totalPower;
        break;
      case 'blight':
        blightCosts += 1;
        blight = cost.count;
        break;
      default:
        return null;
    }
  }
  if (
    sacrifices > 1 ||
    tapCreaturesCosts > 1 ||
    discards > 1 ||
    tapPermanentsCosts > 1 ||
    bounces > 1 ||
    exileCardsCosts > 1 ||
    loyaltyCosts > 1 ||
    blightCosts > 1
  ) {
    return null;
  }
  if (tapCreatures !== null && (mana.length > 0 || sacrifice !== null || discard > 0)) return null;
  // D-407: the creature to blight is chosen after the permanents to tap and before the sacrifice, which a crew cost (its creatures are chosen last, alone) has no place for.
  if (blight > 0 && tapCreatures !== null) return null;
  // D-133: the permanents to tap are chosen before the sacrifice and the discard, and could have been tapped for mana first,
  // so a tap cost is not combined with mana (or with a crew cost).
  if (tapPermanents !== null && (mana.length > 0 || tapCreatures !== null)) return null;
  return {
    tap,
    life,
    counters: [...counters].map(([counter, count]) => ({ counter, count })),
    putCounters: [...put].map(([counter, count]) => ({ counter, count })),
    loyalty,
    discardThis,
    exileThis,
    mill,
    cycling,
    discard,
    discardOf,
    mana,
    sacrifice,
    sacrificeCount,
    bounce,
    bounceCount,
    exileCards,
    tapPermanents,
    tapCreatures,
    blight,
  };
}

/** Why the costs that need no mana and no choice cannot be paid from `source`, or null (CR 118.3). */
function immediateRefusal(
  state: GameState,
  seat: SeatId,
  source: GameObject,
  costs: CostBreakdown,
): string | null {
  if (costs.tap) {
    if (source.zone !== 'battlefield' || source.tapped) return 'it is already tapped';
    // CR 602.5a, 302.6: a creature's {T} ability needs it to have been under control since the turn began.
    if (isSummoningSick(state, source)) return 'it is summoning sick';
  }
  // CR 119.4: life can be paid only if the life total is at least the amount.
  if (costs.life > getSeat(state, seat).life) return `you have less than ${costs.life} life`;
  for (const { counter, count } of costs.counters) {
    if (source.zone !== 'battlefield' || (source.counters[counter] ?? 0) < count) {
      return `it has fewer than ${count} ${counter} counters`;
    }
  }
  // CR 606.6 (D-200): a loyalty ability with a negative cost cannot be activated unless the permanent has at least that many counters.
  if (costs.loyalty !== null) {
    if (source.zone !== 'battlefield') return 'it is not on the battlefield';
    if (costs.loyalty < 0 && (source.counters.loyalty ?? 0) < -costs.loyalty) {
      return `it has fewer than ${-costs.loyalty} loyalty counters`;
    }
  }
  if (costs.discardThis && source.zone !== 'hand') return 'the card is not in your hand';
  // D-185: "Exile this card from your graveyard" is paid from the graveyard; D-229: "Exile this artifact" from the battlefield.
  if (costs.exileThis && source.zone !== 'graveyard' && source.zone !== 'battlefield') {
    return 'it is not in a zone it can be exiled from';
  }
  // CR 118.3, 701.17 (D-229): a player can't pay "mill a card" with fewer cards in the library than that.
  if (costs.mill > getSeat(state, seat).library.length)
    return 'you do not have enough cards in your library';
  // D-139: a counter is put on the permanent the ability belongs to, so it must be on the battlefield.
  if (costs.putCounters.length > 0 && source.zone !== 'battlefield') {
    return 'it is not on the battlefield to put a counter on';
  }
  return null;
}

/** Pays the {T}, life, counter and "discard this card" costs (CR 602.2b, 118.3b). */
export function payImmediateCosts(
  input: GameState,
  seat: SeatId,
  source: ObjectId,
  costs: CostBreakdown,
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  if (costs.tap) {
    state = patchObject(state, source, { tapped: true });
    events.push({ kind: 'tapped', object: source });
  }
  if (costs.life > 0) {
    const life = getSeat(state, seat).life;
    state = loseLifeBy(state, seat, costs.life);
    events.push({ kind: 'lifeChanged', seat, from: life, to: life - costs.life });
  }
  for (const { counter, count } of costs.counters) {
    const obj = state.objects[source];
    if (obj === undefined) continue;
    state = patchObject(state, source, {
      counters: { ...obj.counters, [counter]: (obj.counters[counter] ?? 0) - count },
    });
    events.push({ kind: 'counterRemoved', object: source, counter, count });
  }
  // CR 606.4, 606.5 (D-200): the loyalty symbol puts counters on the permanent or removes them; [0] does neither.
  if (costs.loyalty !== null && costs.loyalty !== 0) {
    const obj = state.objects[source];
    // D-380 (CR 122.6, 101.2): a [+N] puts no counters on a permanent that can't have loyalty counters; the cost is paid all the same (the ability is still activated).
    if (obj !== undefined && (costs.loyalty < 0 || !counterBlocked(state, obj, 'loyalty'))) {
      const count = Math.abs(costs.loyalty);
      state = patchObject(state, source, {
        counters: { ...obj.counters, loyalty: (obj.counters.loyalty ?? 0) + costs.loyalty },
      });
      events.push(
        costs.loyalty > 0
          ? { kind: 'counterAdded', object: source, counter: 'loyalty', count, by: seat }
          : { kind: 'counterRemoved', object: source, counter: 'loyalty', count },
      );
    }
  }
  // D-139: "Put a page counter on this artifact": paid with the {T} and the life, before the mana, so the counter is there when
  // anything triggers from it (a state trigger reads the counters, CR 603.8).
  for (const { counter, count } of costs.putCounters) {
    const obj = state.objects[source];
    // D-380 (CR 122.6, 101.2): a permanent that can't have counters of the kind gets none, and the cost is paid all the same.
    if (obj === undefined || counterBlocked(state, obj, counter)) continue;
    state = patchObject(state, source, {
      counters: { ...obj.counters, [counter]: (obj.counters[counter] ?? 0) + count },
    });
    events.push({ kind: 'counterAdded', object: source, counter, count, by: seat });
  }
  if (costs.discardThis) {
    // CR 702.29a: the card moves from the hand to its owner's graveyard. A commander in the hand
    // going to the graveyard needs no question (CR 903.9b asks only for hand and library).
    // CR 702.35a: a card with madness is exiled instead (`discardOne`).
    const discarded = discardOne(state, seat, source);
    if (discarded !== null) {
      state = discarded.state;
      events.push(...discarded.events);
      // CR 702.29c, 702.29f (D-179): discarded to pay a cycling cost, the card is cycled; it is where it wound up (the graveyard, exile for madness).
      if (costs.cycling) {
        const landed = discarded.events.find((e) => e.kind === 'zoneChanged' && e.from === source);
        if (landed?.kind === 'zoneChanged')
          events.push({ kind: 'cycled', seat, object: landed.to });
      }
    }
  }
  if (costs.mill > 0) {
    // CR 701.17 (D-229): the top cards of the library go to the graveyard as a cost.
    const milled = millCards(state, seat, costs.mill);
    state = milled.state;
    events.push(...milled.events);
  }
  if (costs.exileThis) {
    // D-185, CR 702.141a: the card goes from the graveyard to exile as a cost; the ability is on the stack with the card's last-known
    // information (CR 113.7a), which `moveObject` records. A commander going to exile needs no question (CR 903.9b asks for hand and library).
    const moved = moveObject(state, { object: source, to: 'exile' });
    if (moved.kind === 'done') {
      state = moved.state;
      events.push(...moved.events);
    }
  }
  return { state, events };
}

/**
 * The state mana is planned in: a source that is sacrificed as a cost is treated as tapped, so
 * auto-payment never spends it on mana and then finds nothing to sacrifice. (A player paying by
 * hand may still tap it first: tapped permanents can be sacrificed.)
 */
export function planningState(state: GameState, source: ObjectId, costs: CostBreakdown): GameState {
  const obj = state.objects[source];
  if (costs.sacrifice !== 'this' || obj === undefined || obj.tapped) return state;
  return patchObject(state, source, { tapped: true });
}

/** A plan for the mana of the cost with the sources the seat has now (CR 601.2g-h), or null. */
export function planActivationMana(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  costs: CostBreakdown,
): PaymentPlan | null {
  const obj = state.objects[source];
  const d = obj === undefined ? null : derive(state, obj);
  return planFor(
    planningState(state, source, costs),
    seat,
    costs.mana,
    d === null
      ? { ability: true }
      : { ability: true, source: { types: d.types, subtypes: d.subtypes } },
  );
}

/** The mana plan for the ability being activated (CR 601.2g-h), or null when it cannot be paid. */
export function planForActivation(
  state: GameState,
  seat: SeatId,
  activation: ActivationContext,
): PaymentPlan | null {
  const costs = breakDown(activation.ability.cost, activation.x);
  return costs === null ? null : planActivationMana(state, seat, activation.source, costs);
}

/**
 * Why the seat cannot pay the whole cost of this ability from `source` now, or null when it can
 * (CR 118.3, 602.2). Runs the payment steps on a copy of the state. `x` is the value of X to pay
 * for (CR 602.2b); the legal-action code asks about 0, the X announcement about each candidate.
 */
export function costRefusal(
  state: GameState,
  seat: SeatId,
  source: GameObject,
  costs: readonly Cost[],
  x = 0,
): string | null {
  const parts = breakDown(costs, x);
  if (parts === null) return 'its cost is not one the engine can pay';
  const stuck = immediateRefusal(state, seat, source, parts);
  if (stuck !== null) return stuck;
  const paid = payImmediateCosts(state, seat, source.id, parts).state;
  if (parts.mana.length > 0 && planActivationMana(paid, seat, source.id, parts) === null) {
    return 'you cannot pay its mana cost';
  }
  if (parts.sacrifice === 'this') {
    if (source.zone !== 'battlefield' || controllerOf(state, source) !== seat) {
      return 'you do not control it, so you cannot sacrifice it';
    }
  } else if (parts.sacrifice !== null && parts.sacrificeCount > 0) {
    // CR 701.21a: permanents you control that match. `other` leaves the source out. (X = 0 of "Sacrifice X creatures" asks for none, D-1424.)
    const found = sacrificeCandidates(paid, seat, source.id, parts.sacrifice).length;
    if (found === 0) return 'you have nothing to sacrifice';
    if (found < parts.sacrificeCount) {
      return `you control fewer than ${parts.sacrificeCount} permanents to sacrifice`;
    }
  }
  if (parts.bounce === 'this') {
    if (source.zone !== 'battlefield' || controllerOf(state, source) !== seat) {
      return 'you do not control it, so you cannot return it to your hand';
    }
  } else if (parts.bounce !== null) {
    // D-139: permanents you control that match; `other` leaves the source out.
    const found = controlledCandidates(paid, seat, source.id, parts.bounce).length;
    if (found < parts.bounceCount) {
      return found === 0
        ? "you control nothing to return to its owner's hand"
        : `you control fewer than ${parts.bounceCount} permanents to return to their owners' hands`;
    }
  }
  if (parts.blight > 0 && blightCandidates(paid, seat).length === 0) {
    // CR 701.68b (D-407): a player with no creature that can take the counters can't choose to blight.
    return 'you control no creature to put -1/-1 counters on';
  }
  if (parts.tapPermanents !== null) {
    // CR 118.3 (D-133): enough untapped permanents. The source's own {T} has been paid on `paid`, so it is not one of them.
    const { filter, count } = parts.tapPermanents;
    if (tapCandidates(paid, seat, source.id, filter).length < count) {
      return `you control fewer than ${count} untapped permanents to tap`;
    }
  }
  if (
    parts.discard > 0 &&
    discardCandidates(state, seat, source.id, parts.discardOf).length < parts.discard
  ) {
    return parts.discardOf === null
      ? 'you have too few cards in hand to discard'
      : 'you have too few cards in hand that you may discard for this';
  }
  if (parts.exileCards !== null) {
    // CR 118.3 (D-232): enough cards in the graveyard that match.
    const found = exileCostCandidates(paid, seat, source.id, parts.exileCards.filter).length;
    if (found < parts.exileCards.count) {
      return `you have fewer than ${parts.exileCards.count} matching cards in your graveyard to exile`;
    }
  }
  if (parts.tapCreatures !== null) {
    // CR 702.122a: untapped creatures other than the source with total power N or greater.
    return crewRefusal(paid, seat, source.id, parts.tapCreatures);
  }
  return null;
}
