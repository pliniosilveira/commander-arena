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

/**
 * The wording of the sentences that say "the opponent" with an article, for a seat. With two seats it is the 1v1 text exactly ("The opponent", "the opponent's"); with more it is the
 * numbered name ("Opponent 2", "Opponent 2's"), which has no article. `start` forms open a sentence, `mid` forms sit inside one (issue 537).
 */
export function startNameOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'You';
  return seatCount <= 2 ? 'The opponent' : seatNameOf(seat, viewer, seatCount);
}

export function midNameOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'you';
  return seatCount <= 2 ? 'the opponent' : seatNameOf(seat, viewer, seatCount);
}

export function startPossessiveOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'Your';
  return seatCount <= 2 ? "The opponent's" : possessiveOf(seat, viewer, seatCount);
}

export function midPossessiveOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'your';
  return seatCount <= 2 ? "the opponent's" : possessiveOf(seat, viewer, seatCount);
}

/** "your", "opponent's" (two seats) or "Opponent 2's": the owner of a card named after it ("Face-down card, opponent's"). */
export function bareMidPossessiveOf(seat: SeatId, viewer: SeatId, seatCount = 2): string {
  if (seat === viewer) return 'your';
  return seatCount <= 2 ? "opponent's" : possessiveOf(seat, viewer, seatCount);
}
