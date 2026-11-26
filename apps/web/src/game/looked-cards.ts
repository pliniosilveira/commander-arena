/**
 * The cards a player looks at with "Look at the top six cards of your library. You may reveal an artifact card from
 * among them ..." (D-139, CR 701.20) or "Look at defending player's hand. You may put a creature card from it onto the
 * battlefield ..." (CR 402.3), or "Look at that player's hand. You may cast a spell from among those cards ...", that do not match, for that player's own question. The engine's view lists only
 * the cards that may be taken (`pendingCards` are the decision's `legal` cards), but the player looked at all of them
 * (`looked`), so the host reads the faces of the others from the state and sends them with the snapshot. Only the
 * viewer's own pending `lookTake`, `lookSplit` (the cards already put into the hand) or `move` question gives any: the opponent's looked cards never leave the Worker (CR 401.2).
 * Pure.
 */
import type { GameState, ObjectView, SeatId } from '@commander-arena/engine';

/** What the picker shows of a card looked at that cannot be taken: its face, never more. */
export type LookedCard = Pick<
  ObjectView,
  'id' | 'name' | 'manaCost' | 'supertypes' | 'types' | 'subtypes' | 'oracleText' | 'owner'
>;

export function lookedCards(state: GameState, viewer: SeatId): readonly LookedCard[] {
  const pending = state.pending;
  if (pending?.kind !== 'chooseCards') return [];
  if (
    pending.purpose !== 'lookTake' &&
    pending.purpose !== 'lookSplit' &&
    pending.purpose !== 'move' &&
    // CR 402.3 (Silent-Blade Oni, Extract Brain): the cards of a hand looked at, among which a spell is cast.
    pending.purpose !== 'cast'
  ) {
    return [];
  }
  if (pending.seat !== viewer) return [];
  return (pending.looked ?? []).flatMap((id) => {
    if (pending.legal.includes(id)) return [];
    const obj = state.objects[id];
    if (obj === undefined || obj.card === null) return [];
    const card = state.cards[obj.card];
    const face = card === undefined ? undefined : state.definitions[card.definition]?.faces?.[0];
    if (face === undefined) return [];
    return [
      {
        id,
        name: face.name,
        manaCost: face.manaCost,
        supertypes: face.supertypes,
        types: face.types,
        subtypes: face.subtypes,
        oracleText: face.oracleText,
        owner: obj.owner,
      },
    ];
  });
}
