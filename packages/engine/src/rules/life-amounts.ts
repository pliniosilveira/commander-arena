/**
 * Amounts of life that depend on the player they are for (D-1111, D-1112; the Hashaton deck):
 * - "each opponent loses life equal to the life that player lost this turn" (`lifeLostThisTurn`, CR 119.3): the number of the player the effect applies
 *   to, read as the effect applies to them (`SeatState.lifeLostThisTurn`, kept by `loseLifeBy`);
 * - "you may pay that much life" (`mayPay` with a `payLife` of an amount, CR 119.4, 608.2c): the life paid is worked out once, as the instruction
 *   resolves, into a plain number the question and the payment (`rules/pay-unless.ts`) read.
 */
import type { Amount, Cost } from '../ast/types';
import type { SeatId } from '../ids';
import { getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { amountOf } from './amounts';
import type { SelectContext } from './select';

/** The amount an effect on life applies to `seat`: their own life lost this turn for `lifeLostThisTurn`, else the one amount for everybody. */
export function lifeAmountFor(
  state: GameState,
  amount: Amount,
  seat: SeatId,
  read: () => number,
): number {
  if (typeof amount === 'object' && amount.kind === 'lifeLostThisTurn') {
    return getSeat(state, seat).lifeLostThisTurn;
  }
  return read();
}

/**
 * The cost of a `mayPay` with its life amounts worked out (CR 608.2c): `triggerDamage` is the life that was gained, a count is what it is now. Null when
 * a payment of life comes to 0 or less (nothing to pay, nothing bought, CR 119.4: a gain of 0 life was no event).
 */
export function resolveMayPayCost(
  state: GameState,
  cost: readonly Cost[],
  ctx: SelectContext,
): readonly Cost[] | null {
  const resolved: Cost[] = [];
  for (const c of cost) {
    if (c.kind !== 'payLife' || typeof c.amount === 'number') {
      resolved.push(c);
      continue;
    }
    const life = amountOf(state, c.amount, ctx, []);
    if (life <= 0) return null;
    resolved.push({ kind: 'payLife', amount: life });
  }
  return resolved;
}
