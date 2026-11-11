/**
 * The mana sources of a payment (CR 601.2g, 605.3) and the plan for paying a cost with them: every
 * mana ability the seat may use now as a `PaymentSource` with its real cost and what it makes, the
 * planner's request for a cost, and the sources a `payMana` decision lists. The planner itself is
 * `mana/payment.ts`.
 */
import type { ObjectId, SeatId } from '../ids';
import {
  type PaymentPlan,
  type PaymentSource,
  parseManaCost,
  planPayment,
  type SpendTarget,
} from '../mana';
import type { ManaColor } from '../mana/types';
import { getObject, getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { derive } from './derive';
import {
  canPayPhysicalCosts,
  isColorChoice,
  lifeLossOfActivating,
  manaAbilitiesOf,
  manaCostSymbols,
  manaSacrificeCandidates,
  outcomeColor,
  tierOfAbility,
} from './mana-abilities';
import { isCombinationProduction, productionOutcomes, spendRestrictionOf } from './mana-outcomes';
import { additionalManaFor } from './mana-triggers';

const sourcesBySeat = new WeakMap<GameState, Map<SeatId, readonly PaymentSource[]>>();

/**
 * Every mana ability the seat could use right now, as payment sources (CR 605.3). The listing of the legal plays asks for it once for
 * each ability and each spell it checks against the same state, so it is kept for the pair (state, seat): a state is never changed in
 * place and the sources are read-only.
 */
export function paymentSources(state: GameState, seat: SeatId): readonly PaymentSource[] {
  let bySeat = sourcesBySeat.get(state);
  if (bySeat === undefined) {
    bySeat = new Map();
    sourcesBySeat.set(state, bySeat);
  }
  let sources = bySeat.get(seat);
  if (sources === undefined) {
    sources = paymentSourcesFresh(state, seat);
    bySeat.set(seat, sources);
  }
  return sources;
}

function paymentSourcesFresh(state: GameState, seat: SeatId): PaymentSource[] {
  const out: PaymentSource[] = [];
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    const d = derive(state, obj);
    for (const { abilityIndex, ability } of manaAbilitiesOf(state, obj)) {
      // The mana cost is the planner's business (one level, mana/payment.ts), so only the {T},
      // sacrifice and life costs and the restriction on activating decide whether the source is on
      // offer.
      if (!canPayPhysicalCosts(state, obj, ability, seat)) continue;
      // CR 605.4, D-139: what a triggered mana ability adds ("add an additional {C}") is made with the mana, so the planner counts it.
      const produces = productionOutcomes(state, obj, ability)
        .filter((o) => o.length > 0)
        .map((o) => {
          const extra = additionalManaFor(state, obj, ability, o);
          return extra.length === 0 ? o : [...o, ...extra];
        });
      if (produces.length === 0) continue;
      const symbols = manaCostSymbols(ability);
      const lifeLoss = lifeLossOfActivating(ability);
      out.push({
        object: id,
        abilityIndex,
        produces,
        tier: tierOfAbility(state, obj, ability),
        snow: d.supertypes.includes('snow'),
        // D-183: the mana it makes carries the card types of the permanent.
        types: d.types,
        // D-149: "Spend this mana only to cast an Angel spell".
        restriction: spendRestrictionOf(ability),
        ...(symbols.length > 0 ? { cost: parseManaCost(symbols) } : {}),
        ...((ability.also?.length ?? 0) > 0 ? { extraEffect: true } : {}),
        ...(lifeLoss > 0 ? { lifeLoss } : {}),
      });
    }
  }
  return out;
}

/** What a plan may be asked to avoid or to count on besides the cost (see `planFor`). */
export interface PlanOptions {
  /**
   * Plan without the mana abilities that sacrifice their permanent (a Treasure), for a cost that needs that permanent still on
   * the battlefield afterwards (a sacrifice cost, `rules/cast-cost.ts`).
   */
  readonly avoidSacrificing?: boolean;
  /** Plan without the mana abilities of these permanents: they are tapped for the cost afterwards (D-149). */
  readonly avoidObjects?: readonly ObjectId[];
  /**
   * Extra sources that exist only for this plan: the creatures, artifacts and graveyard cards that
   * Convoke, Improvise and Delve could use instead of mana (`rules/pay-options.ts`, D-120), as a check that
   * a spell can be paid. They are never real taps: the plan is read for "can it be paid", not applied.
   */
  readonly extraSources?: readonly PaymentSource[];
}

export function planFor(
  state: GameState,
  seat: SeatId,
  cost: readonly string[],
  spell: SpendTarget,
  reserve?: readonly ManaColor[],
  options: PlanOptions = {},
): PaymentPlan | null {
  const sources = [...paymentSources(state, seat), ...(options.extraSources ?? [])]
    .filter((s) => options.avoidSacrificing !== true || s.tier !== 'sacrifice')
    .filter((s) => options.avoidObjects === undefined || !options.avoidObjects.includes(s.object));
  // Automatic payment never kills its own player: the life paid for Phyrexian mana and the life the
  // tapped sources cost or take (a pain land, "Pay 1 life") stay below the life total, so the
  // planner is given life - 1 and leaves such a source out when it would not fit. (Paying by hand is
  // still allowed: a player may do what they like with their own life, CR 119.4.)
  return planPayment({
    cost: parseManaCost(cost),
    x: 0,
    pool: getSeat(state, seat).manaPool,
    sources,
    lifeAvailable: Math.max(0, getSeat(state, seat).life - 1),
    spell,
    ...(reserve ? { reserve } : {}),
  });
}

/**
 * The mana sources of a payMana decision (CR 601.2g): every mana ability the seat may tap, with
 * the colors it can make when the player chooses one (any color, a list, the commander's identity,
 * "could produce") or the combinations when it makes one of several.
 */
export function payableSources(
  state: GameState,
  seat: SeatId,
): {
  object: ObjectId;
  abilityIndex: number;
  colors?: ManaColor[];
  combinations?: ManaColor[][];
  sacrifices?: ObjectId[];
}[] {
  return paymentSources(state, seat).map((s) => {
    const obj = state.objects[s.object];
    const ability = obj
      ? manaAbilitiesOf(state, obj).find((m) => m.abilityIndex === s.abilityIndex)?.ability
      : undefined;
    if (!ability) return { object: s.object, abilityIndex: s.abilityIndex };
    // D-222 (CR 601.2b): the permanents a cost "Sacrifice a Spirit" may give up, when there is a choice.
    const gives = manaSacrificeCandidates(state, seat, s.object, ability);
    const sacrifices = gives.length > 1 ? { sacrifices: [...gives] } : {};
    // What the player picks is what the ability makes itself, not the mana a triggered mana ability adds to it (D-139).
    const own =
      obj === undefined ? [] : productionOutcomes(state, obj, ability).filter((o) => o.length > 0);
    if (isCombinationProduction(ability.production)) {
      return {
        object: s.object,
        abilityIndex: s.abilityIndex,
        combinations: own.map((o) => [...o]),
        ...sacrifices,
      };
    }
    if (!isColorChoice(ability.production)) {
      return { object: s.object, abilityIndex: s.abilityIndex, ...sacrifices };
    }
    const colors = own.flatMap((o) => outcomeColor(o) ?? []);
    return { object: s.object, abilityIndex: s.abilityIndex, colors, ...sacrifices };
  });
}
