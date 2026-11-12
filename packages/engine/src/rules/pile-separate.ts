/**
 * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (Fact or Fiction,
 * D-971): the `revealAndSeparate` effect, run as one instruction that asks twice at most.
 *
 * CR 700.3 (General): objects grouped into piles stay where they are (700.3c: the cards are still in the library while they are sorted), each is in exactly one pile (700.3a) and a
 * pile may hold no card (700.3d). CR 701.20 (Reveal): the cards are shown to every player (`cardsRevealed`, public) and do not move (701.20b).
 *
 *  1. The controller reveals the top `count` cards of their library (fewer when it holds fewer; none ends the effect).
 *  2. The separator chooses the cards of pile 1 (a `chooseCards` decision of purpose `separate`, `min` 0, the rest is pile 2). With fewer than two cards there is nothing to choose:
 *     every split of one card is the same choice for the other player, so all of it is pile 1 and the question is not asked.
 *  3. The chooser decides which pile goes where (a `chooseOption` decision of purpose `pile`, options `pile1` and `pile2`, the piles in `piles`); it is asked even when a pile is empty,
 *     because sending a pile to the hand or to the graveyard is a real choice.
 *  4. The chosen pile moves to `chosenTo` and the other to `otherTo`, as ordinary zone changes: the chosen pile first, then the other, each from the top of the library down (nothing in
 *     the CR orders cards put into a hand; CR 404.3 lets the owner arrange cards put into a graveyard together, which the engine does not offer for any effect). A commander asks its
 *     owner as it does for any move (CR 903.9b).
 *
 * "An opponent" is the first opponent in turn order who is still in the game: with more than two players the controller does not choose which (the CR gives that choice to nobody, and
 * D-233 set the same limit for Coin of Fate).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, opponentsOf } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type PileSeparate = Extract<Instruction, { kind: 'pileSeparate' }>;
type RevealAndSeparate = Extract<Effect, { kind: 'revealAndSeparate' }>;

/** The names of the cards, in the order given. A card with no definition (never the case for a card of a library) has no name. */
function namesOf(state: GameState, ids: readonly ObjectId[]): string[] {
  return ids.flatMap((id) => {
    const obj = state.objects[id];
    return obj === undefined ? [] : [derive(state, obj).name];
  });
}

/** The effect as it starts: reveals the top `count` cards and queues the instruction that sorts them. */
export function startPileSeparate(
  state: GameState,
  res: ResolutionContext,
  effect: RevealAndSeparate,
  count: number,
): StepOutcome {
  const cards = getSeat(state, res.controller).library.slice(0, Math.max(count, 0));
  if (cards.length === 0) return done(state);
  const revealed = cards.flatMap((id) => {
    const card = state.objects[id]?.card;
    return card == null ? [] : [card];
  });
  const events: GameEvent[] = [
    {
      kind: 'cardsRevealed',
      seat: res.controller,
      cards: revealed,
      names: namesOf(state, cards),
      from: 'library',
    },
  ];
  const [opponent] = opponentsOf(state, res.controller);
  if (opponent === undefined) return done(state, events);
  const byOpponent = effect.separator === 'opponent';
  return done(state, events, [
    {
      kind: 'pileSeparate',
      seat: res.controller,
      separator: byOpponent ? opponent : res.controller,
      chooser: byOpponent ? res.controller : opponent,
      cards,
      chosenTo: effect.chosenTo,
      otherTo: effect.otherTo,
      chosen: null,
    },
  ]);
}

export function runPileSeparate(
  state: GameState,
  res: ResolutionContext,
  ins: PileSeparate,
): StepOutcome {
  const cards = ins.cards.filter((id) => state.objects[id]?.zone === 'library');
  if (cards.length === 0) return done(state);
  const info = sourceInfo(state, res.source);

  // Step 2: the separator makes pile 1.
  if (ins.first === undefined) {
    if (ins.chosen === null && cards.length >= 2) {
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'chooseCards',
          seat: ins.separator,
          source: res.object,
          purpose: 'separate',
          zone: 'library',
          legal: cards,
          min: 0,
          max: cards.length,
          reveal: true,
          prompt: `Separate the revealed cards into two piles: choose the cards of pile 1; the other cards are pile 2.`,
        },
      };
    }
    const chosen = ins.chosen;
    const first =
      cards.length < 2 || chosen === null ? cards : cards.filter((id) => chosen.includes(id));
    const second = cards.filter((id) => !first.includes(id));
    const event: GameEvent = {
      kind: 'pilesSeparated',
      seat: ins.separator,
      first: namesOf(state, first),
      second: namesOf(state, second),
    };
    return done(state, [event], [{ ...ins, cards, first, chosen: null }]);
  }

  const first = ins.first.filter((id) => cards.includes(id));
  const second = cards.filter((id) => !first.includes(id));

  // Step 3: the chooser picks a pile.
  if (ins.pick === undefined) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseOption',
        seat: ins.chooser,
        purpose: 'pile',
        options: ['pile1', 'pile2'],
        piles: {
          first,
          second,
          chosenTo: ins.chosenTo,
          otherTo: ins.otherTo,
          separator: ins.separator,
          receiver: ins.seat,
        },
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }

  // Step 4: the chosen pile moves first, then the other.
  const chosenPile = ins.pick === 1 ? first : second;
  const otherPile = ins.pick === 1 ? second : first;
  const event: GameEvent = {
    kind: 'pileChosen',
    seat: ins.chooser,
    pile: ins.pick,
    names: namesOf(state, chosenPile),
  };
  return done(
    state,
    [event],
    [...moveInstructions(chosenPile, ins.chosenTo), ...moveInstructions(otherPile, ins.otherTo)],
  );
}
