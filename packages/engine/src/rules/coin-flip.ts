/**
 * Flipping a coin (CR 705). The result is a draw of the seeded generator of the game state (SPEC 4.2: all randomness comes from there), so a replay of the same actions from the
 * same seed flips the same coins.
 */
import type { SeatId } from '../ids';
import { nextInt } from '../rng';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';

/**
 * CR 705.2: `seat` flips a coin after calling `call`. The coin has two equally likely sides (CR 705.1), so the result is one uniform draw of `nextInt` (no modulo bias): 0 is heads,
 * 1 is tails. The player wins the flip when the call matches the result and loses it otherwise; only the player who flips wins or loses (CR 705.2). The call is made before the draw
 * and does not change it, so every call has the same chance.
 */
export function flipCoin(
  state: GameState,
  seat: SeatId,
  call: 'heads' | 'tails',
): { readonly state: GameState; readonly events: readonly GameEvent[]; readonly won: boolean } {
  const [index, rng] = nextInt(state.rng, 2);
  const result = index === 0 ? 'heads' : 'tails';
  const won = call === result;
  return {
    state: { ...state, rng },
    events: [{ kind: 'coinFlipped', seat, call, result, won }],
    won,
  };
}
