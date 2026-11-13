/**
 * Gaining life (CR 119.3, 119.9, 119.10; D-149): every gain of life goes through `gainLife`, the effect `gainLife` and the lifelink
 * damage alike, so that
 * - a replacement effect of a permanent on the battlefield, "If you would gain life, you gain that much life plus 1 instead"
 *   (`lifeGainBonus`), changes the amount first: each such effect of a permanent its player controls applies once, and as they all
 *   add, the order they are applied in (CR 616.1) does not matter. A gain of 0 life is no event and nothing replaces it
 *   (CR 119.10);
 * - a player an effect says can't gain life ("Your opponents can't gain life", `cantGainLife`, CR 119.7, D-1110) gains none: no change to the life
 *   total, no event, no entry in the turn log, and no replacement effect does anything;
 * - the gain is one `lifeGained` event after the `lifeChanged`, with its number among the player's gains of the turn, which the
 *   "gain life" trigger reads (CR 119.9: a gain of 0 life is no event, so nothing triggers).
 */
import type { Replacement } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { cannotGainLife } from './player-protection';

type LifeGainBonus = Extract<Replacement, { kind: 'lifeGainBonus' }>;

/** The extra life that the replacement effects of the battlefield add to a gain by `seat` (CR 614.1a). */
function bonusFor(state: GameState, seat: SeatId): number {
  let bonus = 0;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    for (const ability of derive(state, obj).abilities) {
      if (ability.kind === 'replacement' && ability.replacement.kind === 'lifeGainBonus') {
        bonus += (ability.replacement as LifeGainBonus).amount;
      }
    }
  }
  return bonus;
}

/** `seat` gains `amount` life as the rules count it: replaced, recorded for the turn and told by events. */
export function gainLife(
  state: GameState,
  seat: SeatId,
  amount: number,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (amount <= 0) return { state, events: [] };
  // CR 119.7: a replacement effect that would replace a life gain event of that player won't do anything either, so nothing below runs.
  if (cannotGainLife(state, seat)) return { state, events: [] };
  const gained = amount + bonusFor(state, seat);
  const s = getSeat(state, seat);
  const next = patchSeat(state, seat, { life: s.life + gained });
  const nth = state.turnLog.lifeGained.filter((who) => who === seat).length + 1;
  // D-252: the total gained this turn, by seat ("if you gained 3 or more life this turn", CR 119.3).
  const totals = [...next.turnLog.lifeGainedTotal];
  for (let i = totals.length; i < state.seats.length; i += 1) totals[i] = 0;
  totals[seat] = (totals[seat] ?? 0) + gained;
  return {
    state: {
      ...next,
      turnLog: {
        ...next.turnLog,
        lifeGained: [...next.turnLog.lifeGained, seat],
        lifeGainedTotal: totals,
      },
    },
    events: [
      { kind: 'lifeChanged', seat, from: s.life, to: s.life + gained },
      { kind: 'lifeGained', seat, amount: gained, nth },
    ],
  };
}
