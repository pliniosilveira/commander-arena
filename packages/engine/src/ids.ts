/**
 * Identifiers. All are plain strings or numbers so state stays JSON (SPEC 4.2).
 *
 * - SeatId: index into GameState.seats. Seats are an ordered array; "opponent" is always resolved
 *   through the rules, never as seats[1] (SPEC 2, v2 rule).
 * - CardId: the physical card. Stable for the whole game. Commander status and commander tax belong
 *   to the card, not the object (CR 903.3, 903.8).
 * - ObjectId: one object in one zone. A card gets a fresh ObjectId every time it changes zones
 *   (CR 400.7). Tokens, copies of spells and abilities on the stack are objects without a card.
 */
export type SeatId = number;
export type CardId = `c${number}`;
export type ObjectId = `o${number}`;
export type DecisionId = `d${number}`;

export function cardId(n: number): CardId {
  return `c${n}`;
}
export function objectId(n: number): ObjectId {
  return `o${n}`;
}
