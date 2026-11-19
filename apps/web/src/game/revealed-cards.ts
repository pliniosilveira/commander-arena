/**
 * The cards a `cardsRevealed` event showed (CR 701.20 Reveal): public to both players, so the host sends their
 * faces with the snapshot and the preview panel can show them. The card may already have moved (a revealed
 * library card that went to the hand), so the face is read from the state's card definitions, never from the
 * viewer's own zones. Pure.
 */
import type { GameEvent, GameState, ObjectView, SeatId, Zone } from '@commander-arena/engine';

/** One revealed card: its face, never more. `key` tells two reveals of the same card apart. */
export interface RevealedCard {
  readonly key: string;
  readonly seat: SeatId;
  readonly from: Zone;
  readonly name: string;
  readonly manaCost: ObjectView['manaCost'];
  readonly supertypes: ObjectView['supertypes'];
  readonly types: ObjectView['types'];
  readonly subtypes: ObjectView['subtypes'];
  readonly oracleText: string;
}

/**
 * The cards revealed by the events, in the order they were revealed. Only the latest reveal event's cards
 * are kept when several happen in one snapshot: that is the one the player is reading now.
 */
export function revealedCards(
  state: GameState,
  events: readonly GameEvent[],
): readonly RevealedCard[] {
  let latest: readonly RevealedCard[] = [];
  events.forEach((event, i) => {
    if (event.kind !== 'cardsRevealed') return;
    const cards = event.cards.flatMap((id, n): RevealedCard[] => {
      const card = state.cards[id];
      const face = card === undefined ? undefined : state.definitions[card.definition]?.faces?.[0];
      if (face === undefined) return [];
      return [
        {
          key: `${i}-${n}-${id}`,
          seat: event.seat,
          from: event.from,
          name: face.name,
          manaCost: face.manaCost,
          supertypes: face.supertypes,
          types: face.types,
          subtypes: face.subtypes,
          oracleText: face.oracleText,
        },
      ];
    });
    if (cards.length > 0) latest = cards;
  });
  return latest;
}
