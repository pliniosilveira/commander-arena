/**
 * The answers `legalActionsForDecision` lists for an `arrangeCards` decision, and the ordered
 * answers it lists for "put N cards from your hand on top". The engine accepts every arrangement
 * that places each card once; the list is exhaustive for a few cards and representative beyond.
 */
import type { ObjectId } from '../ids';
import type { Action } from '../state/actions';
import type { ArrangeCardsDecision } from '../state/decisions';

/** Longest list of answers built for one decision. */
const MAX_LISTED = 500;

/** Cards looked at up to which every arrangement is listed (4 cards: 120 scry answers). */
const EVERY_ARRANGEMENT_UP_TO = 4;

/** Every ordering of `items`, in lexicographic order of position. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

/**
 * Every ordered choice of `k` of `items` (k-permutations), in lexicographic order of position, up to
 * `limit` of them: the answers of "put N cards from your hand on top of your library".
 */
export function orderedChoices<T>(items: readonly T[], k: number, limit = MAX_LISTED): T[][] {
  const out: T[][] = [];
  const chosen: T[] = [];
  const used = new Set<number>();
  const walk = (): void => {
    if (out.length >= limit) return;
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (used.has(i)) continue;
      used.add(i);
      chosen.push(items[i] as T);
      walk();
      chosen.pop();
      used.delete(i);
    }
  };
  walk();
  return out;
}

function action(top: readonly ObjectId[], other: readonly ObjectId[]): Action {
  return { kind: 'arrangeCards', top, other };
}

/**
 * CR 701.22a, 701.25a: the arrangements of the cards looked at. The first is always the identity
 * (every card back on top in the order it lies), the second, when there is a second pile, puts all
 * of them there (all to the bottom of a scry, all into the graveyard of a surveil, in the order they
 * lie). Beyond four cards only a few more are listed: the reverse order, and the first card alone on
 * top or alone in the other pile.
 */
export function arrangementActions(d: ArrangeCardsDecision): Action[] {
  const cards = d.cards;
  const hasOther = d.piles.length > 1;
  // CR 401.4 (D-324): "the rest on the bottom in any order" has the bottom pile only: every card goes to `other`, in each order.
  if (!d.piles.includes('top')) {
    if (cards.length <= EVERY_ARRANGEMENT_UP_TO)
      return permutations(cards).map((o) => action([], o));
    return [action([], cards), action([], [...cards].reverse())];
  }
  if (cards.length <= EVERY_ARRANGEMENT_UP_TO) {
    if (!hasOther) return permutations(cards).map((top) => action(top, []));
    const out: Action[] = [action(cards, []), action([], cards)];
    for (let mask = 2 ** cards.length - 1; mask >= 0; mask -= 1) {
      const top = cards.filter((_, i) => (mask & (1 << i)) !== 0);
      const other = cards.filter((_, i) => (mask & (1 << i)) === 0);
      for (const t of permutations(top)) {
        for (const o of permutations(other)) out.push(action(t, o));
      }
    }
    // The first two were listed on their own, ahead of the sweep that reaches them again.
    const seen = new Set<string>();
    return out.filter((a) => {
      const key = JSON.stringify(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const reversed = [...cards].reverse();
  const [first, ...rest] = cards;
  if (first === undefined) return [action([], [])];
  if (!hasOther) return [action(cards, []), action(reversed, [])];
  return [
    action(cards, []),
    action([], cards),
    action(reversed, []),
    action([], reversed),
    action([first], rest),
    action(rest, [first]),
  ];
}
