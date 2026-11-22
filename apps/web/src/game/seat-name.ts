/**
 * Who a seat is called in text: "You", "Opponent" in a two-player game, "Opponent 1", "Opponent 2" and
 * so on in a game with more seats (numbered in seat order, skipping the viewer). `seatCount` defaults
 * to 2, so a caller that does not know it gets the 1v1 words.
 */
import type { SeatId } from '@commander-arena/engine';

/** "You", "Opponent" or "Opponent N". */
export function seatNameOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'You';
  if (seatCount <= 2) return 'Opponent';
  return `Opponent ${seat - (seat > viewer ? 1 : 0) + 1}`;
}

/** "Your", "Opponent's" or "Opponent N's". */
export function possessiveOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  return seat === viewer ? 'Your' : `${seatNameOf(seat, viewer, seatCount)}'s`;
}
