/**
 * Mana abilities and paying costs (CR 605, 106, 118, 601.2g-h).
 *
 * Mana abilities do not use the stack and may be activated while a cost is being paid (CR 605.3a,
 * 605.3b). Fetch lands are not mana abilities and are not handled here.
 *
 * A mana ability can cost mana ("{1}, {T}: Add {U}{B}", with hybrid symbols too: "{R/W}, {T}: Add
 * {R}{R}, {R}{W}, or {W}{W}"), life ("{T}, Pay 1 life: Add one mana of any color") and can do
 * something besides making mana ("~ deals 1 damage to you", CR 605.1a). Activating one by hand pays a
 * mana cost from the mana pool (CR 605.3a: the player taps other sources first); the payment planner
 * plans one level of such abilities itself (see mana/payment.ts). The abilities a permanent has and
 * what using one takes are in `mana-abilities.ts`, the sources of a payment and the plan for one in
 * `mana-sources.ts`; this file activates one by hand and applies a plan.
 */

import type { ManaAbility } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { addToPool, type PaymentPlan, parseManaCost, planPayment } from '../mana';
import type { ManaColor, ManaObject, ManaRestriction, ManaRider } from '../mana/types';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';
import { runImmediateEffects } from './effects';
import {
  canPayPhysicalCosts,
  isColorChoice,
  manaAbilitiesOf,
  manaCostSymbols,
  manaSacrificeCandidates,
  outcomeColor,
  payManaAbilityCosts,
  physicalRefusal,
  sacrificeFilterOf,
  showCost,
} from './mana-abilities';
import {
  isCombinationProduction,
  productionOutcomes,
  sameCombination,
  spendRestrictionOf,
  spentRiderOf,
} from './mana-outcomes';
import { additionalManaFor } from './mana-triggers';

export {
  canTapForMana,
  isSummoningSick,
  manaAbilitiesOf,
  wouldBeSummoningSick,
} from './mana-abilities';

import { controllerOf } from './control';

export { payableSources, paymentSources, planFor } from './mana-sources';

/**
 * How the seat's mana pool pays `symbols` as the cost of an ability (CR 605.3a, 118.3): restricted
 * mana that may not be spent on abilities does not count. Null when the pool cannot pay.
 */
function poolPayment(
  state: GameState,
  seat: SeatId,
  symbols: readonly string[],
): PaymentPlan | null {
  return planPayment({
    cost: parseManaCost(symbols),
    x: 0,
    pool: getSeat(state, seat).manaPool,
    sources: [],
    lifeAvailable: 0,
    spell: { ability: true },
  });
}

/**
 * Whether the seat can activate this mana ability now: its {T}, sacrifice and life costs can be
 * paid, its restriction holds and the mana pool holds the mana its cost asks for (CR 605.3a, 118.3,
 * 602.5b). A source that costs mana is therefore listed for a hand tap only once the pool can pay;
 * the payment planner (`paymentSources`) decides about such sources on its own.
 */
export function canActivateManaAbility(
  state: GameState,
  obj: GameObject,
  ability: ManaAbility,
  seat: SeatId,
): boolean {
  if (!canPayPhysicalCosts(state, obj, ability, seat)) return false;
  const symbols = manaCostSymbols(ability);
  return symbols.length === 0 || poolPayment(state, seat, symbols) !== null;
}

function toManaObjects(
  source: ObjectId,
  snow: boolean,
  colors: readonly ManaColor[],
  restriction: ManaRestriction | null = null,
  rider: ManaRider | null = null,
  sourceTypes: readonly string[] = [],
): ManaObject[] {
  return colors.map((color) => ({
    color,
    snow,
    source,
    restriction,
    ...(rider === null ? {} : { rider }),
    // D-183: the card types of the permanent that makes the mana, kept for "mana from an artifact source spent to cast it".
    ...(sourceTypes.length === 0 ? {} : { sourceTypes }),
  }));
}

/** The result of activating a mana ability by hand: the new state, or why it was refused. */
export type ActivationResult =
  | { readonly state: GameState; readonly events: GameEvent[] }
  | { readonly error: string };

const refuse = (reason: string): { error: string } => ({
  error: `That mana ability cannot be activated: ${reason}`,
});

/** "{R}{R}, {R}{W}, {W}{W}": the combinations on offer, for a message. */
const listCombinations = (outcomes: readonly (readonly ManaColor[])[]): string =>
  outcomes.map((o) => o.map((m) => `{${m}}`).join('')).join(', ');

/**
 * Which outcome of the ability the player picked (CR 605.3b): a color for a choice of color, a
 * combination for a combination. The refusal names what is on offer.
 */
function pickOutcome(
  name: string,
  ability: ManaAbility,
  outcomes: readonly (readonly ManaColor[])[],
  color: ManaColor | null,
  combination: readonly ManaColor[] | null,
): { chosen: ManaColor[] } | { error: string } {
  if (outcomes.length === 0) return refuse(`${name} makes no mana`);
  if (isCombinationProduction(ability.production)) {
    if (color !== null) {
      return refuse(`${name} makes a combination of mana, not one color: say which combination`);
    }
    if (combination === null) {
      const only = outcomes[0];
      if (outcomes.length === 1 && only !== undefined) return { chosen: [...only] };
      return refuse(`${name} makes one of ${listCombinations(outcomes)}: say which`);
    }
    const found = outcomes.find((o) => sameCombination(o, combination));
    return found === undefined
      ? refuse(
          `${name} cannot make ${listCombinations([combination])}, only ${listCombinations(outcomes)}`,
        )
      : { chosen: [...found] };
  }
  if (combination !== null) return refuse(`${name} does not offer a choice of combinations`);
  const offered = outcomes.flatMap((o) => outcomeColor(o) ?? []).join(', ');
  if (color === null) {
    const only = outcomes[0];
    if (outcomes.length === 1 && only !== undefined) return { chosen: [...only] };
    return refuse(`${name} makes mana of a color you choose (${offered}): say which`);
  }
  const found = outcomes.find((o) => outcomeColor(o) === color);
  if (found === undefined) {
    return refuse(
      isColorChoice(ability.production)
        ? `${name} cannot make ${color} mana, only ${offered || 'none'}`
        : `${name} does not offer a choice of color`,
    );
  }
  return { chosen: [...found] };
}

/**
 * Activates one mana ability by hand (CR 605.3b): pays its costs, adds the mana to the pool, then
 * runs the ability's extra effects ("~ deals 1 damage to you") in the same resolution. A mana cost
 * comes out of the pool, so the player taps the sources that pay for it first (CR 605.3a). A
 * choice of color (`oneOf`, any color, the commander's identity, "could produce") must name a color
 * the ability can make now, and a combination must be one of its combinations. Refusals carry a
 * message the player can read; nothing changes when one is returned.
 */
export function activateManaAbility(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  abilityIndex: number,
  color: ManaColor | null,
  combination: readonly ManaColor[] | null = null,
  /** The permanent a cost "Sacrifice a Spirit" gives up (D-216, D-222): required when the player has more than one to give up. */
  sacrifice?: ObjectId,
): ActivationResult {
  // A source that does not exist (a stale or invented id in a payManual action) is an illegal
  // action, which the caller answers with an error; it must not throw.
  const obj = state.objects[source];
  if (!obj) return refuse('that permanent is not in the game');
  const found = manaAbilitiesOf(state, obj).find((m) => m.abilityIndex === abilityIndex);
  if (!found) return refuse('that permanent has no such mana ability');
  const name = derive(state, obj).name;
  const stuck = physicalRefusal(state, obj, found.ability, seat);
  if (stuck !== null) return refuse(stuck);
  // CR 601.2b, 605.3b (D-222): the player chooses the permanent a cost "Sacrifice a Spirit" gives up. With one candidate there is no choice; with more the
  // activation must name one of them (the engine never picks for a player who is paying by hand).
  if (sacrificeFilterOf(found.ability) !== null) {
    const legal = manaSacrificeCandidates(state, seat, source, found.ability);
    if (sacrifice !== undefined && !legal.includes(sacrifice)) {
      return refuse(`${name} cannot sacrifice that permanent`);
    }
    if (sacrifice === undefined && legal.length > 1) {
      return refuse(`Choose which permanent to sacrifice for ${name}`);
    }
  }
  const picked = pickOutcome(
    name,
    found.ability,
    productionOutcomes(state, obj, found.ability),
    color,
    combination,
  );
  if ('error' in picked) return picked;
  const chosen = picked.chosen;
  const snow = derive(state, obj).supertypes.includes('snow');
  let working = state;
  const symbols = manaCostSymbols(found.ability);
  if (symbols.length > 0) {
    // CR 605.3a, 118.3: the cost is paid from the mana already in the pool.
    const plan = poolPayment(working, seat, symbols);
    if (plan === null) {
      return refuse(
        `${name} costs ${showCost(symbols)}, which your mana pool does not hold: tap other sources first`,
      );
    }
    const spent = new Set(plan.fromPool);
    working = patchSeat(working, seat, {
      manaPool: getSeat(working, seat).manaPool.filter((_, i) => !spent.has(i)),
    });
  }
  const paid = payManaAbilityCosts(working, seat, source, found.ability, sacrifice);
  // CR 605.4a (D-139): the triggered mana abilities of "whenever you tap a permanent for {C}" resolve at once, into the same pool.
  const extra = additionalManaFor(working, obj, found.ability, chosen);
  const made = [...chosen, ...extra];
  let next = patchSeat(paid.state, seat, {
    manaPool: addToPool(
      getSeat(paid.state, seat).manaPool,
      toManaObjects(
        source,
        snow,
        made,
        spendRestrictionOf(found.ability),
        spentRiderOf(found.ability, source),
        derive(state, obj).types,
      ),
    ),
  });
  const events: GameEvent[] = [...paid.events];
  if (made.length > 0) events.push({ kind: 'manaAdded', seat, count: made.length });
  const also = found.ability.also ?? [];
  if (also.length > 0) {
    const extra = runImmediateEffects(next, seat, source, also);
    next = extra.state;
    events.push(...extra.events);
  }
  return { state: next, events };
}

/**
 * Applies a payment plan: spends pool mana, taps sources, keeps unspent produced mana (CR 106.4). `riders` are what the mana that was spent
 * carries (D-151): the riders of the pool mana used and of the sources tapped whose mana was not left over.
 */
export function applyPaymentPlan(
  state: GameState,
  seat: SeatId,
  plan: PaymentPlan,
  lifeToPay: number,
): {
  state: GameState;
  events: GameEvent[];
  riders: ManaRider[];
  /** The card types of the source of each mana the plan spent on the cost itself (`PaymentPlan.spentTypes`, D-183). */
  spent: readonly (readonly string[])[];
  /** How many of that mana was from a snow source (`PaymentPlan.spentSnow`, D-260). */
  spentSnow: number;
} {
  const events: GameEvent[] = [];
  const riders: ManaRider[] = [];
  const spent = new Set(plan.fromPool);
  for (const [i, m] of getSeat(state, seat).manaPool.entries()) {
    if (spent.has(i) && m.rider !== undefined) riders.push(m.rider);
  }
  let next = state;
  const pool = getSeat(next, seat).manaPool.filter((_, i) => !spent.has(i));
  next = patchSeat(next, seat, { manaPool: addToPool(pool, plan.leftover) });
  for (const tap of plan.taps) {
    const obj = next.objects[tap.object];
    const ability = obj
      ? manaAbilitiesOf(next, obj).find((m) => m.abilityIndex === tap.abilityIndex)?.ability
      : undefined;
    if (!ability) continue;
    const paid = payManaAbilityCosts(next, seat, tap.object, ability);
    next = paid.state;
    events.push(...paid.events);
    // D-151: mana of a source that was tapped for this payment and not left over was spent on it, with what it carries.
    const rider = spentRiderOf(ability, tap.object);
    if (rider !== null && !plan.leftover.some((m) => m.source === tap.object)) riders.push(rider);
    // The mana was spent as it was made; the ability's other effects still happen (CR 605.3b).
    if ((ability.also?.length ?? 0) > 0) {
      const extra = runImmediateEffects(next, seat, tap.object, ability.also ?? []);
      next = extra.state;
      events.push(...extra.events);
    }
  }
  if (lifeToPay > 0) {
    const s = getSeat(next, seat);
    next = loseLifeBy(next, seat, lifeToPay);
    events.push({ kind: 'lifeChanged', seat, from: s.life, to: s.life - lifeToPay });
  }
  return { state: next, events, riders, spent: plan.spentTypes, spentSnow: plan.spentSnow };
}

/** The colors of mana that stay in the pool of `seat` as a step or phase ends (D-151: "You don't lose unspent red mana as steps and phases end"). */
function colorsThatStay(state: GameState, seat: SeatId): ReadonlySet<ManaColor> {
  const keep = new Set<ManaColor>();
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    for (const a of derive(state, obj).abilities) {
      if (a.kind === 'static' && a.static.kind === 'unspentManaStays') {
        for (const c of a.static.colors) keep.add(c);
      }
    }
  }
  return keep;
}

/** Empties every mana pool (CR 500.5, 106.4), but for the colors a static ability keeps (D-151). */
export function emptyManaPools(state: GameState): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  for (const seat of state.seats) {
    if (seat.manaPool.length === 0) continue;
    const keep = colorsThatStay(state, seat.id);
    const kept = seat.manaPool.filter((m) => keep.has(m.color));
    const lost = seat.manaPool.length - kept.length;
    if (lost === 0) continue;
    events.push({ kind: 'manaEmptied', seat: seat.id, count: lost });
    next = patchSeat(next, seat.id, { manaPool: kept });
  }
  return { state: next, events };
}
