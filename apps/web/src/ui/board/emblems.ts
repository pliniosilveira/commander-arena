/**
 * The small cards of the emblem strip (issue 84, D-243): the monarch (CR 725), the Ring (CR 701.54c)
 * and the emblems that effects made (CR 114, D-201), of one player. Pure: a function of the view.
 */
import type { GameView, ObjectView, SeatId } from '@commander-arena/engine';
import { monarchObject, ringObject } from '../../game/designations';
import { seatLabel } from './resolve';

export type EmblemKind = 'monarch' | 'ring' | 'emblem';

export interface EmblemCard {
  readonly kind: EmblemKind;
  /** The player it belongs to: the monarch, the one the Ring tempts, the one who got the emblem. */
  readonly seat: SeatId;
  /** The object the card previews: the view's own for an emblem, one built for the monarch and the Ring. */
  readonly object: ObjectView;
}

/**
 * The cards of one player in the order they are laid out: the monarch, the Ring, then the emblems in
 * the order of their command zone. Empty when the player has none of them, and then the board draws no strip.
 */
export function emblemCards(view: GameView, seat: SeatId): EmblemCard[] {
  const cards: EmblemCard[] = [];
  const monarch = view.monarch === seat ? monarchObject(view) : null;
  if (monarch !== null) cards.push({ kind: 'monarch', seat, object: monarch });
  const ring = ringObject(view, seat);
  if (ring !== null) cards.push({ kind: 'ring', seat, object: ring });
  const command = view.seats.find((s) => s.id === seat)?.command ?? [];
  for (const object of command) {
    if (object.emblem === true) cards.push({ kind: 'emblem', seat, object });
  }
  return cards;
}

/** The name of a strip for a screen reader and its caption: "Your emblems", "Opponent's emblems". */
export function emblemStripLabel(view: GameView, seat: SeatId): string {
  return seat === view.viewer
    ? 'Your emblems and designations'
    : "Opponent's emblems and designations";
}

/** The short caption on the strip: whose cards these are. */
export function emblemCaption(view: GameView, seat: SeatId): string {
  return seatLabel(view, seat) === 'You' ? 'Yours' : "Opponent's";
}

/** The accessible name of one card: what it is, whose it is, and what it says. */
export function emblemCardLabel(view: GameView, card: EmblemCard): string {
  const owner = card.seat === view.viewer ? '' : " (opponent's)";
  return `${card.object.name}${owner}: ${card.object.oracleText.split('\n').join(' ')}`;
}
