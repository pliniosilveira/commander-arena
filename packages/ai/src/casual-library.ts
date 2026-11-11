/**
 * CasualAgent choices about the top of its library (D-091): how to arrange the cards of a scry, a
 * surveil or "look at the top N cards, then put them back in any order", and which cards of the hand
 * to put back on top. Heuristics, deliberately simple, from what the agent can see: its own lands
 * and hand and the cards it is looking at.
 *
 * - With few lands (fewer than `LANDS_WANTED` in play and none in hand) a land is kept on top; more
 *   than one while it has fewer than two in play. Otherwise lands are not wanted.
 * - A spell is kept when it can be cast soon (its mana value is at most the lands it will have, plus
 *   one); the rest go to the bottom (scry) or the graveyard (surveil).
 * - The cards kept go back in the order they will be wanted: lands first when lands are wanted, then
 *   the cheaper spells.
 */
import type {
  Action,
  ArrangeCardsDecision,
  ChooseCardsDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { findObject, isLand, manaValueOf, ownHand } from './casual-view';

/** Lands in play below which a land is wanted when none is in hand. */
const LANDS_WANTED = 4;

/** Lands in play from which a land is no more than a spare. */
const LANDS_PLENTY = 6;

interface Board {
  /** Lands the viewer controls on the battlefield. */
  readonly lands: number;
  /** Lands in the viewer's hand. */
  readonly handLands: number;
}

function boardOf(view: GameView): Board {
  const lands = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length;
  return { lands, handLands: ownHand(view).filter(isLand).length };
}

interface Looked {
  readonly id: ObjectId;
  readonly land: boolean;
  readonly mv: number;
}

function lookedAt(view: GameView, cards: readonly ObjectId[]): Looked[] {
  const seen = new Map<ObjectId, ObjectView>((view.pendingCards ?? []).map((o) => [o.id, o]));
  return cards.map((id) => {
    const o = seen.get(id) ?? findObject(view, id);
    return { id, land: o !== undefined && isLand(o), mv: o === undefined ? 0 : manaValueOf(o) };
  });
}

/**
 * Whether the agent wants the card on top: a land while it is short of lands (as many as it still
 * needs, up to two), a spell it can cast soon.
 */
function keepers(cards: readonly Looked[], board: Board): Set<ObjectId> {
  const needLand = board.lands < LANDS_WANTED && board.handLands === 0;
  let landsWanted = needLand ? (board.lands < 2 ? 2 : 1) : 0;
  const keep = new Set<ObjectId>();
  for (const c of cards) {
    if (c.land) {
      if (landsWanted > 0) {
        keep.add(c.id);
        landsWanted -= 1;
      }
    } else if (c.mv <= board.lands + board.handLands + 1) {
      keep.add(c.id);
    }
  }
  return keep;
}

/** The order the kept cards go back on top: a land first while one is wanted, then cheap spells. */
function inOrderWanted(cards: readonly Looked[], board: Board): ObjectId[] {
  const needLand = board.lands < LANDS_WANTED && board.handLands === 0;
  const rank = (c: Looked): number => (c.land ? (needLand ? -1 : 1000) : c.mv);
  return cards
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map((x) => x.c.id);
}

/** CR 701.22a, 701.25a: keep what is wanted on top, the rest to the bottom or the graveyard. */
export function chooseArrangement(view: GameView, d: ArrangeCardsDecision): Action {
  const cards = lookedAt(view, d.cards);
  const board = boardOf(view);
  if (d.purpose === 'reorder' || d.piles.length < 2) {
    // "Put them back in any order": every card goes back, the wanted ones first.
    return { kind: 'arrangeCards', top: inOrderWanted(cards, board), other: [] };
  }
  const keep = keepers(cards, board);
  const kept = cards.filter((c) => keep.has(c.id));
  const rest = cards.filter((c) => !keep.has(c.id));
  return {
    kind: 'arrangeCards',
    top: inOrderWanted(kept, board),
    other: rest.map((c) => c.id),
  };
}

/**
 * How much the agent wants to keep a card of its hand: a land it still needs is worth the most, a
 * spell it can cast soon next, then spells it cannot cast yet, and spare lands the least. `index` is
 * the position among the lands of the hand (the second land in hand is wanted less than the first).
 */
function keepValue(card: Looked, board: Board, landIndex: number): number {
  if (card.land) {
    const lands = board.lands + landIndex;
    if (lands >= LANDS_PLENTY) return 5;
    return lands < LANDS_WANTED ? 80 - 10 * landIndex : 30 - 5 * landIndex;
  }
  const mana = board.lands + board.handLands;
  return card.mv <= mana + 1 ? 50 + card.mv : Math.max(0, 20 - (card.mv - mana));
}

/**
 * "Put N cards from your hand on top of your library": the N cards it wants least (spare lands late,
 * spells it cannot cast), in the order it will want to draw them again: the most useful first.
 */
export function choosePutOnTop(view: GameView, d: ChooseCardsDecision): Action {
  const cards = lookedAt(view, d.legal);
  const board = boardOf(view);
  let landIndex = 0;
  const scored = cards.map((c, index) => {
    const value = keepValue(c, board, c.land ? landIndex : 0);
    if (c.land) landIndex += 1;
    return { id: c.id, index, value };
  });
  const chosen = [...scored].sort((a, b) => a.value - b.value || a.index - b.index).slice(0, d.min);
  // The answer is the order from the top: the card it would most like to draw again goes first.
  const objects = chosen.sort((a, b) => b.value - a.value || a.index - b.index).map((c) => c.id);
  return { kind: 'chooseCards', objects };
}
