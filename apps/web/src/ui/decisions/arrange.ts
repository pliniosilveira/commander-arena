/**
 * arrangeCards (CR 701.22 Scry, CR 701.25 Surveil, and "look at the top N cards, then put them back
 * in any order"): the player looked at the top cards of their library and places every one of them
 * exactly once, in order, into one or two piles. Pure functions of the decision and the local
 * arrangement, unit tested without a DOM. By construction every function returns an arrangement
 * that places each card once, so the answer is always one the engine accepts.
 *
 * The piles are the engine's: `top` (put back on top, the first card becomes the top card) and
 * `other` (a scry's bottom pile, the last card becomes the bottom card; a surveil's graveyard; a
 * reorder has none). The one pile of a reorder, and of the `bottom` purpose (D-324, "the rest on
 * the bottom of your library in any order", CR 401.4), is kept in `top` here; `arrangeAction` sends
 * the cards of the bottom one to `other`, where the engine wants them.
 */
import type { Action, ArrangeCardsDecision, ObjectId } from '@commander-arena/engine';
import { ordinal } from './cards-picker';
import { plural } from './lookup';

export type Pile = 'top' | 'other';

export interface Arrangement {
  /** The cards that go back on top, the first becoming the top card. */
  readonly top: readonly ObjectId[];
  /** The rest: the bottom (last is the bottom card) for a scry, the graveyard for a surveil. */
  readonly other: readonly ObjectId[];
}

type Looked = Pick<ArrangeCardsDecision, 'cards' | 'purpose'>;

export const NO_ARRANGEMENT: Arrangement = { top: [], other: [] };

/** Everything stays on top, in the order it was looked at. */
export function defaultArrangement(decision: Pick<ArrangeCardsDecision, 'cards'>): Arrangement {
  return { top: decision.cards, other: [] };
}

/** True when the decision has a second pile (a scry or a surveil; a reorder and the bottom have one pile only). */
export function hasOtherPile(decision: Pick<ArrangeCardsDecision, 'purpose'>): boolean {
  return decision.purpose === 'scry' || decision.purpose === 'surveil';
}

/** The name of the second pile: "Bottom" for a scry, "Graveyard" for a surveil. */
export function otherPileTitle(decision: Pick<ArrangeCardsDecision, 'purpose'>): string {
  return decision.purpose === 'surveil' ? 'Graveyard' : 'Bottom';
}

export function pileTitle(decision: Pick<ArrangeCardsDecision, 'purpose'>, pile: Pile): string {
  if (pile === 'top') return decision.purpose === 'bottom' ? 'Bottom' : 'Top';
  return otherPileTitle(decision);
}

/** What the heading of a pile says about its order. */
export function pileHint(decision: Pick<ArrangeCardsDecision, 'purpose'>, pile: Pile): string {
  if (pile === 'top') {
    return decision.purpose === 'bottom'
      ? 'The last card is the bottom card of your library.'
      : 'The first card is the top card of your library.';
  }
  return decision.purpose === 'surveil'
    ? 'They enter your graveyard in this order; the last one ends on top.'
    : 'The last card is the bottom card of your library.';
}

const piles = (a: Arrangement, pile: Pile): readonly ObjectId[] =>
  pile === 'top' ? a.top : a.other;

const withPile = (a: Arrangement, pile: Pile, cards: readonly ObjectId[]): Arrangement =>
  pile === 'top' ? { top: cards, other: a.other } : { top: a.top, other: cards };

/** Which pile a card is in, with its position there, or null for a card that is not placed. */
export function locate(
  a: Arrangement,
  id: ObjectId,
): { readonly pile: Pile; readonly index: number } | null {
  const inTop = a.top.indexOf(id);
  if (inTop !== -1) return { pile: 'top', index: inTop };
  const inOther = a.other.indexOf(id);
  return inOther === -1 ? null : { pile: 'other', index: inOther };
}

/** Moves a card one place earlier (-1) or later (+1) within its pile; stays put at the ends. */
export function moveWithin(a: Arrangement, id: ObjectId, step: -1 | 1): Arrangement {
  const at = locate(a, id);
  if (at === null) return a;
  const cards = piles(a, at.pile);
  const target = at.index + step;
  const mine = cards[at.index];
  const theirs = cards[target];
  if (mine === undefined || theirs === undefined) return a;
  return withPile(
    a,
    at.pile,
    cards.map((c, i) => (i === at.index ? theirs : i === target ? mine : c)),
  );
}

/** Puts a card into `pile` at `index` (clamped); the card leaves the pile it was in. */
export function placeCard(
  a: Arrangement,
  decision: Pick<ArrangeCardsDecision, 'purpose'>,
  id: ObjectId,
  pile: Pile,
  index: number,
): Arrangement {
  const at = locate(a, id);
  if (at === null || (pile === 'other' && !hasOtherPile(decision))) return a;
  const without: Arrangement = {
    top: a.top.filter((c) => c !== id),
    other: a.other.filter((c) => c !== id),
  };
  const into = piles(without, pile);
  const clamped = Math.max(0, Math.min(index, into.length));
  return withPile(without, pile, [...into.slice(0, clamped), id, ...into.slice(clamped)]);
}

/**
 * A card dropped on a pile before the card at `at` (an index in the pile as it is shown, so the
 * end of the pile is its length). Taking the card out first shifts the index by one when the card
 * came from earlier in the same pile.
 */
export function dropCard(
  a: Arrangement,
  decision: Pick<ArrangeCardsDecision, 'purpose'>,
  id: ObjectId,
  pile: Pile,
  at: number,
): Arrangement {
  const from = locate(a, id);
  const adjusted = from !== null && from.pile === pile && from.index < at ? at - 1 : at;
  return placeCard(a, decision, id, pile, adjusted);
}

/**
 * Sends a card to the other pile. It lands where it was in the order the cards were looked at (so a
 * card sent away and back is where it started): before the first card of that pile that was
 * looked at later than it.
 */
export function moveToPile(
  a: Arrangement,
  decision: Looked,
  id: ObjectId,
  pile: Pile,
): Arrangement {
  const at = locate(a, id);
  if (at === null || at.pile === pile) return a;
  const original = decision.cards.indexOf(id);
  const into = piles(a, pile);
  const before = into.findIndex((c) => decision.cards.indexOf(c) > original);
  return placeCard(a, decision, id, pile, before === -1 ? into.length : before);
}

/** A click on a card of a scry or a surveil sends it to the other pile; a reorder has none. */
export function flipPile(a: Arrangement, decision: Looked, id: ObjectId): Arrangement {
  const at = locate(a, id);
  if (at === null || !hasOtherPile(decision)) return a;
  return moveToPile(a, decision, id, at.pile === 'top' ? 'other' : 'top');
}

/** The answer: `top` and `other` as arranged; for the bottom (D-324) the one pile is the engine's `other`. */
export function arrangeAction(
  a: Arrangement,
  decision: Pick<ArrangeCardsDecision, 'purpose'>,
): Action {
  if (decision.purpose === 'bottom') return { kind: 'arrangeCards', top: [], other: a.top };
  return { kind: 'arrangeCards', top: a.top, other: a.other };
}

/** True when the arrangement places every card of the decision exactly once. */
export function arrangementComplete(decision: Pick<ArrangeCardsDecision, 'cards'>, a: Arrangement) {
  const placed = [...a.top, ...a.other];
  return (
    placed.length === decision.cards.length &&
    new Set(placed).size === placed.length &&
    decision.cards.every((c) => placed.includes(c))
  );
}

/** The bar's prompt: "Scry 2: choose the cards to put on the bottom and the order." */
export function arrangePrompt(decision: Looked): string {
  const n = decision.cards.length;
  switch (decision.purpose) {
    case 'scry':
      return n === 1
        ? 'Scry 1: keep the card on top or put it on the bottom.'
        : `Scry ${n}: choose the cards to put on the bottom and the order.`;
    case 'surveil':
      return n === 1
        ? 'Surveil 1: keep the card on top or put it into your graveyard.'
        : `Surveil ${n}: choose the cards to put into your graveyard and the order of the rest.`;
    case 'reorder':
      return `Look at the top ${plural(n, 'card')}: put them back in any order.`;
    case 'bottom':
      return n === 1
        ? 'Put the card on the bottom of your library.'
        : `Put the other ${n} cards on the bottom of your library in any order.`;
  }
}

/** The dialog's second line: where the cards are now. */
export function arrangeDetail(decision: Looked, a: Arrangement): string {
  if (decision.purpose === 'bottom') {
    return `${a.top.length} on the bottom. The last card ends on the very bottom.`;
  }
  const top = `${a.top.length} on top`;
  if (!hasOtherPile(decision)) return `${top}. The first card ends on top.`;
  const rest =
    decision.purpose === 'surveil'
      ? `${a.other.length} into the graveyard`
      : `${a.other.length} on the bottom`;
  return `${top}, ${rest}.`;
}

/** The badge of a card: its place in the order of its pile. Graveyard cards have none. */
export function arrangeBadge(
  decision: Pick<ArrangeCardsDecision, 'purpose'>,
  a: Arrangement,
  id: ObjectId,
): string | null {
  const at = locate(a, id);
  if (at === null) return null;
  if (at.pile === 'top' && decision.purpose === 'bottom') {
    const fromBottom = a.top.length - at.index;
    return fromBottom === 1 ? 'Bottom card' : `${ordinal(fromBottom)} from bottom`;
  }
  if (at.pile === 'top') return `${ordinal(at.index + 1)} from top`;
  if (decision.purpose === 'surveil') return null;
  const fromBottom = a.other.length - at.index;
  return fromBottom === 1 ? 'Bottom card' : `${ordinal(fromBottom)} from bottom`;
}

/** What a screen reader hears for a card: its name, its pile and its place there. */
export function arrangeLabel(
  decision: Pick<ArrangeCardsDecision, 'purpose'>,
  a: Arrangement,
  id: ObjectId,
  name: string,
): string {
  const at = locate(a, id);
  if (at === null) return name;
  const size = piles(a, at.pile).length;
  return `${name}, ${pileTitle(decision, at.pile)} pile, ${at.index + 1} of ${size}`;
}
