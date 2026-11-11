/**
 * The contract between the decision layer (which knows what the player may click right now) and
 * the board (which draws objects and players). The decision layer builds an `Interaction` from the
 * pending decision and provides it; board components only read it. The default is "nothing is
 * interactive", so the board renders on its own.
 */
import type { ObjectId, SeatId } from '@commander-arena/engine';
import { createContext, useContext } from 'react';

export interface Interaction {
  /** Objects the player may click now: legal targets, attackers, blockers, playable cards, mana. */
  readonly clickable: ReadonlySet<ObjectId>;
  /** Objects already chosen in the current decision (targets, attackers, a selected blocker). */
  readonly selected: ReadonlySet<ObjectId>;
  /** Players the player may click now (a legal player target, or the player an attack goes at). */
  readonly clickableSeats: ReadonlySet<SeatId>;
  readonly selectedSeats: ReadonlySet<SeatId>;
  /** True while a decision wants a choice: everything not clickable is dimmed. */
  readonly dimOthers: boolean;
  onObject(id: ObjectId): void;
  onSeat(seat: SeatId): void;
  /** A short label drawn on a tile, such as "Attacking", "Blocks Serra Angel" or "Target". */
  badge(id: ObjectId): string | null;
  /**
   * The blocks the player has picked in the declare blockers question and not yet declared, so the
   * board can pair each picked blocker with its attacker by number. Absent outside that question.
   */
  readonly pendingBlocks?: readonly { readonly blocker: ObjectId; readonly attacker: ObjectId }[];
}

const EMPTY_OBJECTS: ReadonlySet<ObjectId> = new Set();
const EMPTY_SEATS: ReadonlySet<SeatId> = new Set();

export const NO_INTERACTION: Interaction = {
  clickable: EMPTY_OBJECTS,
  selected: EMPTY_OBJECTS,
  clickableSeats: EMPTY_SEATS,
  selectedSeats: EMPTY_SEATS,
  dimOthers: false,
  onObject: () => {},
  onSeat: () => {},
  badge: () => null,
};

const InteractionContext = createContext<Interaction>(NO_INTERACTION);

export const InteractionProvider = InteractionContext.Provider;

export function useInteraction(): Interaction {
  return useContext(InteractionContext);
}
