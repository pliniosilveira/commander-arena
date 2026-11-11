/**
 * Paying a cost by tapping the mana sources the player names (CR 605.3b, 601.2g-h): each source's
 * mana ability is activated in order (a mana cost of one of them comes out of the pool), then the
 * cost is paid from the pool alone. Shared by casting a spell, activating an ability and paying
 * Ward (rules/pay-unless.ts).
 */

import type { ObjectId, SeatId } from '../ids';
import { parseManaCost, planPayment, type SpendTarget } from '../mana';
import type { ManaColor, ManaRider } from '../mana/types';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { activateManaAbility, applyPaymentPlan } from './mana-engine';

/** What a payment may spend: a spell's own restrictions apply, or an ability's (CR 106.6, 605.3a). */
export type PaymentUse = SpendTarget;

export interface ManualTap {
  readonly object: ObjectId;
  readonly abilityIndex: number;
  readonly color?: ManaColor | null;
  readonly combination?: readonly ManaColor[] | null;
  /** "Sacrifice a Spirit: Add {R}." (D-216): the permanent given up; the engine chooses when it is left out. */
  readonly sacrifice?: ObjectId;
}

/** The state after the payment, or why the taps do not pay the cost (nothing changes then). */
export function payByTapping(
  state: GameState,
  seat: SeatId,
  symbols: readonly string[],
  use: PaymentUse,
  taps: readonly ManualTap[],
):
  | {
      state: GameState;
      events: GameEvent[];
      riders: ManaRider[];
      spent: readonly (readonly string[])[];
    }
  | { error: string } {
  let working = state;
  const events: GameEvent[] = [];
  for (const tap of taps) {
    const r = activateManaAbility(
      working,
      seat,
      tap.object,
      tap.abilityIndex,
      tap.color ?? null,
      tap.combination ?? null,
      tap.sacrifice,
    );
    if ('error' in r) return { error: r.error };
    working = r.state;
    events.push(...r.events);
  }
  const plan = planPayment({
    cost: parseManaCost(symbols),
    x: 0,
    pool: getSeat(working, seat).manaPool,
    sources: [],
    lifeAvailable: Math.max(0, getSeat(working, seat).life - 1),
    spell: use,
  });
  if (plan === null) return { error: 'The mana you tapped does not pay that cost' };
  const applied = applyPaymentPlan(working, seat, plan, plan.lifePaid);
  return {
    state: applied.state,
    events: [...events, ...applied.events],
    riders: applied.riders,
    spent: applied.spent,
  };
}
