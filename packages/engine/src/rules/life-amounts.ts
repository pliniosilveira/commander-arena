/**
 * Amounts of life that depend on the player they are for (D-364, D-365; the Hashaton deck):
 * - "each opponent loses life equal to the life that player lost this turn" (`lifeLostThisTurn`, CR 119.3): the number of the player the effect applies
 *   to, read as the effect applies to them (`SeatState.lifeLostThisTurn`, kept by `loseLifeBy`);
 * - "each player loses a third of their life, rounded up" (`half` of `lifeTotalOf` of the player the effect names, CR 119.3, 107.1a): the life total of the player the
 *   effect applies to, read as it applies to them;
 * - "you may pay that much life" (`mayPay` with a `payLife` of an amount, CR 119.4, 608.2c): the life paid is worked out once, as the instruction
 *   resolves, into a plain number the question and the payment (`rules/pay-unless.ts`) read.
 */
import type { Amount, Cost, PlayerSelector } from '../ast/types';
import type { SeatId } from '../ids';
import { getSeat } from '../state/ops';
import type { GameState, ThisWayCounts } from '../state/types';
import { amountOf } from './amounts';
import type { SelectContext } from './select';

/** The amount an effect on life applies to `seat`: their own life lost this turn for `lifeLostThisTurn`, else the one amount for everybody. */
export function lifeAmountFor(
  state: GameState,
  amount: Amount,
  seat: SeatId,
  read: () => number,
  thisWay?: ThisWayCounts,
  /** The players the effect names: "their life" in the amount is the life of the one the effect is applying to. */
  players?: PlayerSelector,
): number {
  // CR 119.3, 107.1a (Dire Fleet Ravager): "a third of their life, rounded up" is each affected player's own life total, divided as the amount says.
  if (players !== undefined) {
    const own = ownLifeAmount(state, amount, seat, players);
    if (own !== null) return own;
  }
  // CR 608.2c (Deadly Tempest): "the number of creatures they controlled that were destroyed this way" is each player's own number.
  if (typeof amount === 'object' && amount.kind === 'thisWay') {
    if (amount.what === 'destroyedCreaturesOfAffected') {
      return thisWay?.destroyedCreaturesBy?.[seat] ?? 0;
    }
  }
  if (typeof amount === 'object' && amount.kind === 'lifeLostThisTurn') {
    return getSeat(state, seat).lifeLostThisTurn;
  }
  // CR 508.1b, 506.3 (issue 101): the creatures attacking that player, not a planeswalker or a battle they control.
  if (typeof amount === 'object' && amount.kind === 'attackersOfAffected') {
    const attackers = state.combat?.attackers ?? [];
    return attackers.filter((a) => a.target.kind === 'player' && a.target.seat === seat).length;
  }
  return read();
}

/** The amount of `half` of the life total of the players the effect names, for `seat` (the life total as it is, divided and rounded as the amount says); null for any other amount. */
function ownLifeAmount(
  state: GameState,
  amount: Amount,
  seat: SeatId,
  players: PlayerSelector,
): number | null {
  if (typeof amount !== 'object') return null;
  if (amount.kind === 'lifeTotalOf') {
    return JSON.stringify(amount.player) === JSON.stringify(players)
      ? Math.max(0, getSeat(state, seat).life) // CR 107.1b: a negative life total counts as 0 in a calculation
      : null;
  }
  if (amount.kind !== 'half') return null;
  const of = ownLifeAmount(state, amount.of, seat, players);
  if (of === null) return null;
  const divisor = amount.divisor ?? 2;
  return amount.round === 'down' ? Math.floor(of / divisor) : Math.ceil(of / divisor);
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
