/**
 * Rolling a die (CR 706, D-271). The result is a draw of the seeded generator of the game state (SPEC 4.2: all randomness comes from there), so a replay
 * of the same actions from the same seed rolls the same numbers.
 */
import type { SeatId } from '../ids';
import { nextInt } from '../rng';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/types';

/**
 * CR 706.1, 706.1a, 706.2: `seat` rolls one die of `sides` sides. A die has `sides` equally likely outcomes numbered 1 to `sides`, so the natural result is
 * one uniform draw plus 1 (`nextInt` has no modulo bias). The engine has no modifier of a roll, so the natural result is the result (CR 706.2).
 */
export function rollDie(
  state: GameState,
  seat: SeatId,
  sides: number,
): { readonly state: GameState; readonly events: readonly GameEvent[]; readonly result: number } {
  const [index, rng] = nextInt(state.rng, sides);
  const result = index + 1;
  return {
    state: { ...state, rng },
    events: [{ kind: 'dieRolled', seat, sides, result }],
    result,
  };
}
