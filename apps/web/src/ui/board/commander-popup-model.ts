/**
 * What the commander popup of the table board shows (`CommanderPopup.tsx`): the seat's commander and
 * its tax, and every other player with the name of their commander. Pure, so it is unit tested. The
 * damage each commander has dealt is not shown: the view keys commander damage by card id with no
 * owner, so it cannot be told per dealing commander yet (#535).
 */
import type { GameView, ObjectView, SeatId, SeatView } from '@commander-arena/engine';
import { commandersOf, commanderTaxes } from './resolve';
import { opponentLabel } from './table-label';

export interface PopupOther {
  readonly seat: SeatId;
  /** "You", "Opponent 1" and so on (`opponentLabel`). */
  readonly label: string;
  /** The names of their commanders that are visible; empty when they are in a hidden zone. */
  readonly commanders: readonly string[];
  readonly lost: boolean;
}

export interface CommanderPopup {
  readonly seat: SeatId;
  readonly label: string;
  /** The seat's commanders, wherever they are (command zone, battlefield, stack, graveyard, exile, hand). */
  readonly commanders: readonly ObjectView[];
  /** The tax of each commander, in order (the view does not say which is which, `commanderTaxes`). */
  readonly taxes: readonly number[];
  readonly others: readonly PopupOther[];
}

export function commanderPopup(view: GameView, seat: SeatView): CommanderPopup {
  return {
    seat: seat.id,
    label: opponentLabel(view, seat.id),
    commanders: commandersOf(view, seat.id),
    taxes: commanderTaxes(seat),
    others: view.seats
      .filter((s) => s.id !== seat.id)
      .map((s) => ({
        seat: s.id,
        label: opponentLabel(view, s.id),
        commanders: commandersOf(view, s.id).map((o) => o.name),
        lost: s.hasLost,
      })),
  };
}
