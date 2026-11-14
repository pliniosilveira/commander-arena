/**
 * Loyalty abilities (CR 606, D-200). A loyalty ability is an activated ability with a loyalty symbol in its cost (CR 606.2): the
 * engine derives the property from the cost and nothing else carries a flag. What makes it special lives where abilities are
 * activated: sorcery timing and one activation a turn for each permanent (`activate-legality.ts`, CR 606.3), the payment of the
 * symbol (`activate-costs.ts`, CR 606.4, 606.5, 606.6) and the note in the turn log (`activate.ts`).
 */
import type { Cost } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameState } from '../state/types';

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
 * CR 606.3: whether a loyalty ability of this permanent was activated this turn, by any player. A permanent that left the battlefield
 * and came back is a new object (CR 400.7), so its entries are not the old one's.
 */
export function loyaltyActivatedThisTurn(state: GameState, object: ObjectId): boolean {
  return state.turnLog.activated.some((a) => a.object === object && a.loyalty === true);
}
