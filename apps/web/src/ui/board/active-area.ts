/**
 * The active player's area (issue 52 follow-up, D-153, D-241): the whole of their side of the board is
 * edged (a line of the accent colour round it, no tint) when it is their turn, not only a badge on the strip. The highlight follows the
 * ACTIVE player (CR 102.1: the player whose turn it is), never the player who has priority.
 */
import type { GameView, SeatId } from '@commander-arena/engine';
import { turnOwner } from '../../game/turn-label';

/** The class an area of the board (strip, battlefield, hand) carries: active or idle. */
export function areaClass(view: GameView, seat: SeatId): 'is-active-area' | 'is-idle-area' {
  return view.activeSeat === seat ? 'is-active-area' : 'is-idle-area';
}

/**
 * The accessible name of a battlefield: "Your battlefield, your turn" while it is that player's
 * turn, so the highlight is not conveyed by colour alone.
 */
export function battlefieldLabel(view: GameView, seat: SeatId): string {
  const owner = turnOwner(seat, view.viewer);
  return view.activeSeat === seat
    ? `${owner} battlefield, ${owner.toLowerCase()} turn`
    : `${owner} battlefield`;
}
