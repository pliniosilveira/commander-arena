/**
 * Loyalty abilities (CR 606, D-200). A loyalty ability is an activated ability with a loyalty symbol in its cost (CR 606.2): the
 * engine derives the property from the cost and nothing else carries a flag. What makes it special lives where abilities are
 * activated: sorcery timing and one activation a turn for each permanent (`activate-legality.ts`, CR 606.3), the payment of the
 * symbol (`activate-costs.ts`, CR 606.4, 606.5, 606.6) and the note in the turn log (`activate.ts`).
 */
import type { Cost } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { loyaltyLimitSources } from './derive-statics';
import { matchesFilter } from './select';

/** The loyalty symbol of a list of costs, or null when it has none (it is not a loyalty ability, CR 606.2). */
export function loyaltyCostOf(
  costs: readonly Cost[],
): Extract<Cost, { readonly kind: 'loyalty' }> | null {
  for (const c of costs) if (c.kind === 'loyalty') return c;
  return null;
}

/** Whether the ability with these costs is a loyalty ability (CR 606.2). */
export function isLoyaltyAbility(costs: readonly Cost[]): boolean {
  return loyaltyCostOf(costs) !== null;
}

/**
 * CR 606.3: how many loyalty abilities of this permanent were activated this turn, by any player. A permanent that left the battlefield
 * and came back is a new object (CR 400.7), so its entries are not the old one's.
 */
export function loyaltyActivationsThisTurn(state: GameState, object: ObjectId): number {
  return state.turnLog.activated.filter((a) => a.object === object && a.loyalty === true).length;
}

/**
 * CR 606.3: how many times a turn a loyalty ability of this planeswalker may be activated: once, or the greatest `timesEachTurn` of the
 * `loyaltyActivationLimit` static abilities ("You may activate the loyalty abilities of planeswalkers you control twice each turn rather
 * than only once") of permanents its controller has that describe it. The limit is for the planeswalker as a whole, not for each ability.
 */
export function loyaltyActivationLimitOf(state: GameState, obj: GameObject): number {
  const controller = controllerOf(state, obj);
  let limit = 1;
  for (const source of loyaltyLimitSources(state)) {
    if (source.timesEachTurn <= limit || controllerOf(state, source.object) !== controller)
      continue;
    if (matchesFilter(state, obj, source.planeswalkers, { controller, source: source.object.id })) {
      limit = source.timesEachTurn;
    }
  }
  return limit;
}

/** CR 606.3: whether no more loyalty abilities of this permanent may be activated this turn. */
export function loyaltyLimitReached(state: GameState, obj: GameObject): boolean {
  const used = loyaltyActivationsThisTurn(state, obj.id);
  return used > 0 && used >= loyaltyActivationLimitOf(state, obj);
}
