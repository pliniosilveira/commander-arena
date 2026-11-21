/**
 * Dredge (CR 702.52a, issue 102, Life from the Loam): "If you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand." A static
 * ability of a card in its owner's graveyard that replaces the draw (CR 614.1a, 614.11): the owner is asked, for each card with dredge in their graveyard that could be used, whether
 * to use it (`confirmOptional`, purpose `'dredge'`, the card as `subject`); the first one accepted is used, and when none is the card is drawn as usual. A card with dredge is
 * offered only when the library has at least N cards (CR 702.52b). A card returned that way is not drawn (CR 121.1): no `cardDrawn` event follows and the counters of cards drawn do
 * not change. The question is asked in the draw step by the turn-based action (`rules/flow.ts`, `answerDredgeDraw`) and, in a resolving spell or ability, by the instruction `draw`
 * (`rules/draw.ts`, `answerResolutionDredge` in `rules/stack.ts`). The cards are asked in the order they lie in the graveyard; the one declined is skipped for the same draw.
 */
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { definitionOf, getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { drawSkippedBy } from './draw-skip';
import { millCards } from './mill';
import { sourceInfo } from './source-info';
import { moveObject } from './zones';

/** N of the dredge keyword of the card (CR 702.52a), or null when it has none. */
function dredgeCountOf(state: GameState, id: ObjectId): number | null {
  const obj = state.objects[id];
  if (obj === undefined || obj.card === null) return null;
  const face = definitionOf(state, obj.card).faces[0];
  for (const a of face?.abilities ?? []) {
    if (a.kind === 'keyword' && a.keyword.kind === 'dredge') return a.keyword.count;
  }
  return null;
}

/**
 * The next card of `seat`'s graveyard that could be dredged for the draw about to be made, after the card `after` (the one just declined; the first card when left out): it has dredge
 * and the library has at least N cards (CR 702.52b). Null when there is none, or when the draw is skipped (CR 614.11: a skipped draw has nothing to replace).
 */
export function dredgeCandidate(
  state: GameState,
  seat: SeatId,
  after?: ObjectId,
): { readonly card: ObjectId; readonly count: number } | null {
  if (getSeat(state, seat).hasLost || drawSkippedBy(state, seat) !== null) return null;
  const graveyard = getSeat(state, seat).graveyard;
  const start = after === undefined ? 0 : graveyard.indexOf(after) + 1;
  const librarySize = getSeat(state, seat).library.length;
  for (const id of graveyard.slice(start)) {
    const count = dredgeCountOf(state, id);
    if (count !== null && librarySize >= count) return { card: id, count };
  }
  return null;
}

/** The question "dredge N?" for the card `card` in the graveyard of `seat` (the card's own text is its source). */
export function dredgeQuestion(state: GameState, seat: SeatId, card: ObjectId): NewDecision {
  const info = sourceInfo(state, card);
  return {
    kind: 'confirmOptional',
    seat,
    source: card,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
    purpose: 'dredge',
    subject: card,
  };
}

/**
 * Dredges `card`: `seat` mills N cards and returns the card to their hand instead of drawing (CR 702.52a). Nothing is done when the card is no longer in their graveyard with dredge
 * or the library is too small by now (the answer came after something changed); null then.
 */
export function performDredge(
  state: GameState,
  seat: SeatId,
  card: ObjectId,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  const count = dredgeCountOf(state, card);
  const obj = state.objects[card];
  if (
    count === null ||
    obj === undefined ||
    obj.zone !== 'graveyard' ||
    obj.owner !== seat ||
    getSeat(state, seat).library.length < count
  ) {
    return null;
  }
  const milled = millCards(state, seat, count);
  const back = moveObject(milled.state, { object: card, to: 'hand', commanderChoice: false });
  if (back.kind !== 'done') return null;
  return { state: back.state, events: [...milled.events, ...back.events] };
}
