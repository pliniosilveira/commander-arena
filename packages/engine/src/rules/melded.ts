/**
 * Melded permanents (D-277, CR 701.42 Meld, CR 712.4 and 712.8g Double-Faced Cards, 712.21): the object model and its readers.
 *
 * The model is "one permanent on the battlefield, two cards in every other zone". A melded permanent is one `GameObject` represented by two cards
 * (CR 701.42a, 712.4a): `card` is the first card, `meldedWith` the second, `face` is 1, the combined back face, which the definition of the first card
 * holds as `faces[1]` (the card data of that face is the same on both cards of the pair, CR 712.8g). Everything that reads the characteristics of
 * an object (derive, the layers, the abilities, the view) goes through that face and needs no change. In every other zone a meld card is an ordinary card
 * with its front face only (CR 712.4b, 712.8a, 712.8b); when the permanent leaves the battlefield one permanent leaves and two cards arrive (CR 712.21), which
 * `rules/zones.ts` does.
 *
 * What reads "the card of an object" and must see two of them goes through `cardsOf`, `commanderCardOf` and `successorsOf` here; a test
 * (`test/meld-reads.test.ts`) fails when a rule reads the commander flag of `obj.card` directly (the precedent is `test/control-reads.test.ts`).
 */
import type { CardId, ObjectId } from '../ids';
import { definitionOf, getObject, patchObject, patchSeat } from '../state/ops';
import type { GameObject, GameState } from '../state/types';

/** The cards that represent the object, in order: its `card` and, for a melded permanent, the second card (CR 712.4a). Empty for a token or an ability. */
export function cardsOf(obj: GameObject): readonly CardId[] {
  if (obj.card === null) return [];
  return obj.meldedWith === undefined ? [obj.card] : [obj.card, obj.meldedWith];
}

/**
 * The commander card that represents the object, or null when none does (CR 903.3, 903.3b: a melded permanent one of whose cards is a player's commander
 * is that player's commander). A token, a permanent copying a commander and an ability are never commanders.
 *
 * A melded permanent's commander card is always its first card, the one `GameObject.card` names: the meld effect puts the commander's exile object first
 * (`rules/meld.ts`) and `checkInvariants` fails on a melded permanent whose second card is the only commander. So the first card is the only one to read.
 */
export function commanderCardOf(state: GameState, obj: GameObject): CardId | null {
  return isCommanderCardId(state, obj.card) ? obj.card : null;
}

/** Whether the card is a card its owner designated as a commander (CR 903.3). */
export function isCommanderCardId(state: Pick<GameState, 'cards'>, card: CardId | null): boolean {
  return card !== null && state.cards[card]?.isCommander === true;
}

/** Whether the object is a commander (CR 903.3, 903.3b). */
export function isCommanderObject(state: GameState, obj: GameObject): boolean {
  return commanderCardOf(state, obj) !== null;
}

/**
 * CR 712.21c, 400.7: the objects a permanent that left became, in the order of its cards: the one `successor` names and, when it was a melded permanent, the
 * second card's. An effect that can find "the new object" finds both cards and does the same to each (CR 712.21c). Each is returned only while `keep` says
 * it is still where the effect looks for it.
 */
export function successorsOf(
  state: GameState,
  id: ObjectId,
  keep: (obj: GameObject) => boolean,
): ObjectId[] {
  const info = state.lki[id];
  if (info === undefined) return [];
  const found: ObjectId[] = [];
  for (const next of [info.successor, info.companionSuccessor]) {
    if (next === undefined) continue;
    const obj = state.objects[next];
    if (obj !== undefined && keep(obj)) found.push(next);
  }
  return found;
}

function sameFace(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Why two cards cannot be melded (CR 701.42b: "Only two cards belonging to the same meld pair can be melded. Tokens, cards that aren't meld cards, or meld cards
 * that don't form a meld pair can't be melded"), or null when they can. The pair is read from data: each card is a meld card whose `meld.partner` is the other's
 * name, and both hold the same combined face (CR 712.8g). Both cards must have the same owner (the meld abilities say "you both own and control"), and, because
 * a melded permanent has one commander card, they are not both commanders (not built, D-277).
 */
export function meldPairIssue(state: GameState, a: GameObject, b: GameObject): string | null {
  if (a.token !== null || b.token !== null || a.card === null || b.card === null) {
    return 'a token or an object that is not a card can not be melded';
  }
  return meldCardsIssue(state, a.card, b.card);
}

/**
 * Whether the two objects are two commander cards. CR 701.42 would meld them (CR 903.3b names a commander that is melded, and nothing there forbids two), but a melded permanent here has one commander card (D-277): the case is not
 * built, so the meld ability does not start at all for such a pair (`rules/meld-condition.ts`): exiling cards that then could not be melded would take them out of the game
 * for nothing, so the permanents stay where they are.
 */
export function twoCommanderCards(state: GameState, a: GameObject, b: GameObject): boolean {
  return isCommanderCardId(state, a.card) && isCommanderCardId(state, b.card);
}

/** `meldPairIssue` for two cards: the part that reads the cards and their data. */
export function meldCardsIssue(
  state: Pick<GameState, 'cards' | 'definitions'>,
  a: CardId,
  b: CardId,
): string | null {
  if (a === b) return 'the same card can not be melded with itself';
  const da = state.definitions[state.cards[a]?.definition ?? -1];
  const db = state.definitions[state.cards[b]?.definition ?? -1];
  if (da === undefined || db === undefined) return 'a card of the pair is not in the game';
  if (da.layout !== 'meld' || db.layout !== 'meld')
    return 'a card that is not a meld card can not be melded';
  if (da.meld === undefined || db.meld === undefined)
    return 'a meld card with no counterpart can not be melded';
  if (da.meld.partner !== db.name || db.meld.partner !== da.name) {
    return 'the two cards are not the two cards of one meld pair';
  }
  const fa = da.faces[1];
  const fb = db.faces[1];
  if (fa === undefined || fb === undefined || !sameFace(fa, fb)) {
    return 'the two cards do not hold the same combined face';
  }
  if (state.cards[a]?.owner !== state.cards[b]?.owner) return 'the two cards have different owners';
  if (isCommanderCardId(state, a) && isCommanderCardId(state, b)) {
    return 'two commander cards melded into one permanent are not supported';
  }
  return null;
}

/**
 * CR 202.3c: the mana cost a melded permanent's mana value is calculated from, the combined mana cost of the front faces of the two cards that represent it.
 * Null when neither front face has a mana cost, and null for an object that is not melded.
 */
export function meldedManaCost(state: GameState, obj: GameObject): readonly string[] | null {
  if (obj.card === null || obj.meldedWith === undefined) return null;
  const parts = [obj.card, obj.meldedWith].map(
    (card) => definitionOf(state, card).faces[0]?.manaCost ?? null,
  );
  return parts.every((cost) => cost === null) ? null : parts.flatMap((cost) => cost ?? []);
}

/**
 * CR 712.21a, 712.21b (D-279): puts `top` above `other`, the two cards a melded permanent became in the zone it left for, which are next to each other in a graveyard or a
 * library of their owner (the top of a library is its first card, the top of a graveyard its last); in exile `top` is made the card exiled last, the one with the
 * later timestamp (the player who exiled the permanent chooses, an exception to CR 613.7m). Who chooses is the caller's business (`MeldOrder.seat`). Does nothing
 * when they already are in that order.
 */
export function arrangeMeldedCards(
  state: GameState,
  zone: 'graveyard' | 'library' | 'exile',
  top: ObjectId,
  other: ObjectId,
): GameState {
  if (zone === 'exile') {
    const a = getObject(state, top);
    const b = getObject(state, other);
    if (a.timestamp > b.timestamp) return state;
    return patchObject(patchObject(state, top, { timestamp: b.timestamp }), other, {
      timestamp: a.timestamp,
    });
  }
  const seat = getObject(state, top).owner;
  const seatState = state.seats[seat];
  if (seatState === undefined) return state;
  const list = zone === 'library' ? seatState.library : seatState.graveyard;
  const i = list.indexOf(top);
  const j = list.indexOf(other);
  if (i < 0 || j < 0) return state;
  // The top of a library is index 0, so the card on top has the lower index; the top of a graveyard is its last card.
  const inOrder = zone === 'library' ? i < j : i > j;
  if (inOrder) return state;
  const swapped = list.map((id) => (id === top ? other : id === other ? top : id));
  return patchSeat(state, seat, zone === 'library' ? { library: swapped } : { graveyard: swapped });
}
