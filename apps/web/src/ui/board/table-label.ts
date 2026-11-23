/**
 * The name of a seat on the board for three or more players: "You", or "Opponent 1", "Opponent 2" and
 * so on in seat order, so opponents can be told apart. With a single opponent it is "Opponent", as in the
 * 1v1 game. It is the label of the table board only; `seatLabel` (`resolve.ts`, `decisions/lookup.ts`)
 * still says "Opponent" for every seat (docs/MORE_OPPONENTS_INVESTIGATION.md, "Board plan").
 */
import type { GameView, SeatId } from '@commander-arena/engine';

export function opponentLabel(view: GameView, seat: SeatId): string {
  if (seat === view.viewer) return 'You';
  const opponents = view.seats.filter((s) => s.id !== view.viewer);
  if (opponents.length <= 1) return 'Opponent';
  return `Opponent ${opponents.findIndex((s) => s.id === seat) + 1}`;
}
