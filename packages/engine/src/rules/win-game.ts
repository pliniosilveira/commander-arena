/**
 * "You win the game." (CR 104.2b: an effect may state that a player wins the game; CR 104.1: a game ends immediately when a player wins).
 *
 * The game ends with the player as its winner, whoever else is still in it: a player who "can't lose the game" (`cantLoseGame`) does not keep it going, as CR 104.1 ends the game
 * when a player wins, not when the others lose. A player whose opponent controls a permanent that says "Your opponents can't win the game" (`opponentsCantWin`, `rules/player-protection.ts`)
 * does not win: the "can't" effect wins (CR 101.2) and nothing happens. A player who has left the game, or a game that has ended already, changes nothing.
 */
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { cannotWinGame } from './player-protection';

export function winTheGame(
  state: GameState,
  seat: SeatId,
): { readonly state: GameState; readonly events: GameEvent[] } {
  if (state.result !== null || getSeat(state, seat).hasLost || cannotWinGame(state, seat)) {
    return { state, events: [] };
  }
  return {
    state: { ...state, result: { kind: 'win', winner: seat }, pending: null },
    events: [{ kind: 'gameEnded', result: 'win', winner: seat }],
  };
}
