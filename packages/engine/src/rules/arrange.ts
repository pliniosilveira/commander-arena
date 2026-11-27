/**
 * Arranging the top of a library (D-091): scry (CR 701.22), surveil (CR 701.25), "look at the top N
 * cards of your library, then put them back in any order", and "put N cards from your hand on top
 * of your library in any order".
 *
 * - CR 701.22a: to scry N is to look at the top N cards, put any number of them on the bottom in any
 *   order and the rest on top in any order. A scry never moves a card between zones, so the cards
 *   keep their objects and only the order of the library changes (CR 400.7 does not apply).
 * - CR 701.22b, 701.25c: scry 0 and surveil 0 are no scry or surveil event: nothing is asked and
 *   nothing is emitted (the effect never queues the instruction).
 * - CR 701.22d, 701.25d: an ability that triggers on scrying or surveilling triggers even when the
 *   actions were impossible, so a scry or surveil of a library with no card still emits its event.
 * - CR 701.25a: a surveil puts the cards it does not keep on top into the graveyard, a real zone
 *   change (`zoneChanged` events: the graveyard is public).
 * - CR 401.4 (D-324): "put the rest on the bottom of your library in any order" (purpose `bottom`, after
 *   a `lookTake`): the owner of the cards chooses their order, a second use of the same decision.
 * - CR 401.2: nobody may know the order of a library, so the cards looked at reach only the player
 *   who looks (the decision, shown to that seat alone by `view.ts`); everyone else sees counts.
 */
import type { ObjectId } from '../ids';
import type { ArrangeCardsDecision, ChooseCardsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat, seatsInOrder } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { surveilExtraLook } from './statics';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

type ArrangeInstruction = Extract<Instruction, { kind: 'arrange' }>;
type PutOnTopInstruction = Extract<Instruction, { kind: 'putOnTop' }>;

const PILES: Readonly<Record<ArrangeInstruction['purpose'], ArrangeCardsDecision['piles']>> = {
  scry: ['top', 'bottom'],
  surveil: ['top', 'graveyard'],
  reorder: ['top'],
  // CR 401.4 (D-324): the cards go to the bottom of the library in the order their owner chooses.
  bottom: ['bottom'],
};

/**
 * Whether `top` and `other` place every card in `cards` exactly once, with `other` empty unless the
 * decision has a second pile. The one check both the API and the instruction rely on.
 */
export function isArrangement(
  cards: readonly ObjectId[],
  piles: ArrangeCardsDecision['piles'],
  top: readonly ObjectId[],
  other: readonly ObjectId[],
): boolean {
  // A pile the decision lacks takes no card: a reorder has only `top`, the bottom arrangement (D-324) only `other`.
  if (!piles.includes('top') && top.length > 0) return false;
  if (!piles.some((p) => p !== 'top') && other.length > 0) return false;
  const placed = [...top, ...other];
  return (
    placed.length === cards.length &&
    new Set(placed).size === placed.length &&
    placed.every((id) => cards.includes(id))
  );
}

/**
 * CR 701.22a, 701.25a: ask the player to arrange the cards looked at, or (with the answer) reorder
 * the library and, for a surveil, put the other cards into the graveyard.
 */
export function runArrange(
  state: GameState,
  res: ResolutionContext,
  instruction: ArrangeInstruction,
): StepOutcome {
  const { seat, purpose } = instruction;
  // CR 401.2 ("the top three cards of target player's library"): the library looked at may be another player's; `seat` looks and arranges.
  const owner = instruction.libraryOf ?? seat;
  const library = getSeat(state, owner).library;
  // CR 401.4 (D-324): the cards to put on the bottom are named by the effect (they are not always the top of the library any more).
  const looked =
    purpose === 'bottom'
      ? (instruction.cards ?? []).filter((id) => library.includes(id))
      : library.slice(
          0,
          // CR 701.25a (Enhanced Surveillance): a surveil looks at the cards its controller's statics add to its number.
          Math.min(
            instruction.count + (purpose === 'surveil' ? surveilExtraLook(state, seat) : 0),
            library.length,
          ),
        );
  const rest = library.filter((id) => !looked.includes(id));
  const answer = instruction.arranged;

  if (answer === null) {
    // CR 701.22d, 701.25d: the event happens even though there was nothing to look at.
    if (looked.length === 0) {
      // CR 701.25d: a surveil of an empty library is still a surveil, which "for the first time each turn" and "When you do" count.
      if (purpose === 'surveil') {
        return { ...done(recordSurveil(state, seat), noCards(purpose, seat)), performed: 1 };
      }
      return done(state, noCards(purpose, seat));
    }
    // "Put them back in any order" with one card can only put it back where it is: no question.
    // The card of a library the effect names ("target player's library") is still looked at: what follows ("You may have that player shuffle") is decided knowing it.
    if (purpose === 'reorder' && looked.length === 1 && instruction.libraryOf === undefined) {
      return done(state);
    }
    // CR 401.4: one card has no order to choose, and no card nothing to do.
    if (purpose === 'bottom' && looked.length <= 1)
      return done(...putOnBottom(state, seat, rest, looked));
    const decision: Omit<ArrangeCardsDecision, 'id'> = {
      kind: 'arrangeCards',
      seat,
      source: res.object,
      purpose,
      cards: looked,
      piles: PILES[purpose],
      ...(owner === seat ? {} : { libraryOf: owner }),
    };
    return { state, events: [], front: [], needs: decision };
  }

  if (!isArrangement(looked, PILES[purpose], answer.top, answer.other)) {
    throw new Error('The arrangement does not place the cards that were looked at');
  }
  const { top, other } = answer;
  if (purpose === 'bottom') return done(...putOnBottom(state, seat, rest, other));
  if (purpose === 'scry') {
    // CR 701.22a: the cards for the bottom go there in the order given; the last is the bottom card.
    const next = patchSeat(state, seat, { library: [...top, ...rest, ...other] });
    return done(next, [{ kind: 'scried', seat, top: top.length, bottom: other.length }]);
  }
  if (purpose === 'reorder') {
    return done(patchSeat(state, owner, { library: [...top, ...rest] }));
  }
  // CR 701.25a: keep the ones for the top in order, then move the others to the graveyard. They stay
  // in the library list until their own move takes them out, so the state is consistent throughout.
  let next = recordSurveil(patchSeat(state, seat, { library: [...top, ...other, ...rest] }), seat);
  const events: GameEvent[] = [
    { kind: 'surveiled', seat, top: top.length, toGraveyard: other.length },
  ];
  const surveiledIn: ObjectId[] = [];
  for (const id of other) {
    const moved = moveObject(next, { object: id, to: 'graveyard' });
    // A move into a graveyard never asks (CR 903.9b is about the hand and the library).
    if (moved.kind !== 'done')
      throw new Error('Surveiling a card into the graveyard asked a decision');
    next = moved.state;
    events.push(...moved.events);
    // CR 701.25a, 400.7: the card as it is in the graveyard (a new object), unless a replacement effect sent it elsewhere.
    for (const e of moved.events) {
      if (
        e.kind === 'zoneChanged' &&
        e.from === id &&
        e.toZone === 'graveyard' &&
        e.card !== null
      ) {
        surveiledIn.push(e.to);
      }
    }
  }
  if (surveiledIn.length > 0) {
    next = {
      ...next,
      turnLog: {
        ...next.turnLog,
        surveiledCards: [
          ...(next.turnLog.surveiledCards ?? []),
          ...surveiledIn.map((card) => ({ card, by: seat })),
        ],
      },
    };
  }
  // CR 608.2c, 603.12: the surveil was done, which "When you do" after it reads (`performed`).
  return { ...done(next, events), performed: 1 };
}

/**
 * CR 401.4, 101.4 ("Put all creatures on the bottom of their owners' libraries", `moveToZone.ownersArrange`): the moves are done; each owner of two or more of the cards they put
 * into a library arranges theirs on the bottom, in turn order starting with the active player. The cards are already at the bottom of each library (below every other card), so
 * the arrangement only orders them, and no player is told the order (CR 401.4). A token that ceased to exist and a commander put into the command zone (CR 903.9b) are not in a library.
 */
export function runArrangeMoved(state: GameState, res: ResolutionContext): StepOutcome {
  const moved = res.lastMoved ?? [];
  const queue: Instruction[] = [];
  for (const seat of seatsInOrder(state, state.turn.activeSeat)) {
    const library = getSeat(state, seat).library;
    // CR 111.7: a token put into a library is no card and ceases to exist when state-based actions are next checked, so it has no place to be given.
    const cards = moved.filter((id) => library.includes(id) && state.objects[id]?.token === null);
    if (cards.length >= 2) {
      queue.push({
        kind: 'arrange',
        purpose: 'bottom',
        seat,
        count: cards.length,
        cards,
        arranged: null,
      });
    }
  }
  return done(state, [], queue);
}

/** CR 701.25 (Surveil): the turn log counts the surveil of `seat` ("for the first time each turn", Whispering Snitch). */
function recordSurveil(state: GameState, seat: ArrangeInstruction['seat']): GameState {
  return {
    ...state,
    turnLog: { ...state.turnLog, surveils: [...(state.turnLog.surveils ?? []), seat] },
  };
}

/**
 * CR 401.4 (D-324): the cards go to the bottom of the library in the order given, the last being the bottom card. They are already in the library, so nothing changes zone
 * (as for a scry, CR 701.22a): they keep their objects and only the order of the library changes. The owner does not reveal the order: a `cardsBottomed` event tells only how many.
 */
function putOnBottom(
  state: GameState,
  seat: ArrangeInstruction['seat'],
  rest: readonly ObjectId[],
  bottom: readonly ObjectId[],
): [GameState, GameEvent[]] {
  const next = patchSeat(state, seat, { library: [...rest, ...bottom] });
  return [
    next,
    bottom.length > 0 ? [{ kind: 'cardsBottomed', seat, count: bottom.length, ordered: true }] : [],
  ];
}

/** The event of a scry or surveil of an empty library (CR 701.22d, 701.25d); none for a reorder or the bottom. */
function noCards(purpose: ArrangeInstruction['purpose'], seat: ArrangeInstruction['seat']) {
  if (purpose === 'scry') return [{ kind: 'scried' as const, seat, top: 0, bottom: 0 }];
  if (purpose === 'surveil') return [{ kind: 'surveiled' as const, seat, top: 0, toGraveyard: 0 }];
  return [];
}

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function putOnTopPrompt(count: number, toBottom = false): string {
  if (toBottom) return 'Put a card from your hand on the bottom of your library.';
  if (count === 1) return 'Put a card from your hand on top of your library.';
  const word = NUMBERS[count] ?? String(count);
  return `Put ${word} cards from your hand on top of your library in any order. The first card you choose ends up on top.`;
}

/**
 * "Put N cards from your hand on top of your library in any order": ask for the cards in the order
 * they go (or, with the answer, queue the moves). The last chosen card moves first so the first
 * chosen ends on top. A hand of exactly one card has nothing to choose.
 */
export function runPutOnTop(
  state: GameState,
  res: ResolutionContext,
  instruction: PutOnTopInstruction,
): StepOutcome {
  const { seat } = instruction;
  const hand = getSeat(state, seat).hand;
  const count = Math.min(instruction.count, hand.length);
  const chosen = instruction.chosen ?? (hand.length <= 1 ? hand : null);
  if (chosen === null) {
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat,
      source: res.object,
      purpose: 'putOnTop',
      zone: 'hand',
      legal: hand,
      min: count,
      max: count,
      reveal: false,
      prompt: putOnTopPrompt(count, instruction.toBottom === true),
    };
    return { state, events: [], front: [], needs: decision };
  }
  return done(
    state,
    [],
    [...chosen].reverse().map((object) => ({
      kind: 'move' as const,
      object,
      to: 'library' as const,
      position: instruction.toBottom === true ? ('bottom' as const) : ('top' as const),
      tapped: false,
      commanderChoice: null,
    })),
  );
}
