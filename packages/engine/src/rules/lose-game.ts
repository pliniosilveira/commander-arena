/**
 * "Each player ... loses the game" (CR 104.3e: an effect may state that a player loses the game; D-269).
 *
 * The players the effect names who are still in the game lose it together, as one change: they are all marked before anything else looks (CR 104.4a: if all
 * the players remaining in a game lose simultaneously the game is a draw, which `evaluateGameEnd` finds as the result settles). A player who "can't lose the
 * game" (`cantLoseGame`) does not: the "can't" effect wins (CR 101.2). A loss by an effect leaves the game as any other loss does (CR 104.5), the monarch
 * designation of a player who leaves passes on (CR 725.4).
 */
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { monarchAfterLoss } from './monarch';
import { cannotLoseGame } from './player-protection';

export function loseTheGame(
  input: GameState,
  seats: readonly SeatId[],
): { readonly state: GameState; readonly events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  // Whether a player can't lose is read once, before anyone loses: the abilities of the permanents of a player who has just lost do not change who else can.
  const losing = seats.filter(
    (seat) => !getSeat(state, seat).hasLost && !cannotLoseGame(state, seat),
  );
  for (const seat of losing) {
    state = patchSeat(state, seat, { hasLost: true, drewFromEmptyLibrary: false });
    events.push({ kind: 'playerLost', seat, reason: 'effect' });
  }
  if (losing.length > 0) {
    const handed = monarchAfterLoss(state);
    state = handed.state;
    events.push(...handed.events);
  }
  return { state, events };
}
