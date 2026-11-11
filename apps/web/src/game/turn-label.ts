/**
 * How a turn is named for the player (issue 52, D-153): the official word "turn" with the number of
 * the ROUND, so "Your turn 5" and "Opponent's turn 5" are both in round 5, when every player has had
 * (or is having) their fifth turn. The engine's own turn counter (`GameView.turn`, which cards such as
 * "during your first three turns" do not use either: they count the player's own turns) is unchanged
 * and counts every player's turn; this module only converts it for display.
 */
import type { SeatId } from '@commander-arena/engine';

/**
 * The round a turn belongs to: the number of rounds started, so with `seatCount` players the turns
 * 1 to `seatCount` are round 1 (CR 500: the players take turns in order, so each round holds one
 * turn of each player). Zero before the first turn (setup, mulligans). The engine's turn number is
 * 1-based and counts every turn of every player, including a turn that is taken in addition (extra
 * turns), which the display counts like any other (the engine has no extra turns yet).
 */
export function roundOf(turn: number, seatCount: number): number {
  if (turn <= 0 || seatCount <= 0) return 0;
  return Math.floor((turn - 1) / seatCount) + 1;
}

/** "Your" or "Opponent's": the name form the UI uses for a seat. */
export function turnOwner(seat: SeatId, viewer: SeatId): string {
  return seat === viewer ? 'Your' : "Opponent's";
}

/** "Your turn 5" or "Opponent's turn 5": whose turn it is and the round it is in. */
export function turnLabel(seat: SeatId, viewer: SeatId, turn: number, seatCount: number): string {
  return `${turnOwner(seat, viewer)} turn ${roundOf(turn, seatCount)}`;
}
