/**
 * "Exile two creature cards from your graveyard" as a cost of an activated ability (CR 118.3, 602.2b, 400.7, D-232): the pieces of the payment (`rules/activate.ts`) and the
 * effect that reads the cards afterwards (`splitCostExiled`: "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other
 * to the battlefield tapped"). The player chooses the cards of their own graveyard that match (all of them when exactly that many match); each goes to exile (a
 * commander going to exile is never asked: CR 903.9b asks for the hand and the library), and the objects they become in exile are remembered by the ability on the stack.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { opponentsOf, zoneList } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { moveInstructions } from './effect-support';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

/** The cards of the graveyard of `seat` that the cost of an activation of `source` may exile. */
export function exileCostCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId,
  filter: ObjectFilter,
): ObjectId[] {
  const { controller: _you, ...described } = filter;
  return zoneList(state, 'graveyard', seat).filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      id !== source &&
      matchesFilter(state, card, { ...described, zone: 'graveyard' }, { controller: seat, source })
    );
  });
}

/** The question "which cards do you exile?" for a cost: exactly `count` of `legal`, public, and `cancel` rewinds the activation (CR 733). */
export function activationExileDecision(
  seat: SeatId,
  source: ObjectId,
  legal: readonly ObjectId[],
  count: number,
): NewDecision {
  return {
    kind: 'chooseCards',
    seat,
    source,
    purpose: 'exile',
    zone: 'graveyard',
    legal,
    min: count,
    max: count,
    reveal: true,
    prompt: `Exile ${count === 1 ? 'a card' : `${count} cards`} from your graveyard.`,
    forCost: true,
  };
}

/** Exiles the chosen cards: the state, the events and the objects the cards became in exile. Null when a card is not in the graveyard. */
export function exileChosen(
  state: GameState,
  chosen: readonly ObjectId[],
): { state: GameState; events: GameEvent[]; exiled: ObjectId[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  const exiled: ObjectId[] = [];
  for (const id of chosen) {
    if (next.objects[id]?.zone !== 'graveyard') return null;
    const moved = moveObject(next, { object: id, to: 'exile' });
    if (moved.kind !== 'done' || moved.newObject === null) return null;
    next = moved.state;
    events.push(...moved.events);
    exiled.push(moved.newObject);
  }
  return { state: next, events, exiled };
}

type SplitInstruction = Extract<Instruction, { kind: 'splitExiled' }>;

/** The effect `splitCostExiled` as it resolves: the opponent chooses (a decision unless one card is left), the cards go where the text says. */
export function startSplit(state: GameState, res: ResolutionContext): StepOutcome {
  const cards = (res.costExiled ?? []).filter((id) => state.objects[id]?.zone === 'exile');
  const [opponent] = opponentsOf(state, res.controller);
  if (cards.length === 0 || opponent === undefined) return done(state);
  return done(state, [], [{ kind: 'splitExiled', seat: opponent, cards, chosen: null }]);
}

export function runSplitExiled(
  state: GameState,
  res: ResolutionContext,
  ins: SplitInstruction,
): StepOutcome {
  const cards = ins.cards.filter((id) => state.objects[id]?.zone === 'exile');
  if (cards.length === 0) return done(state);
  const [only] = cards;
  if (ins.chosen === null && !(cards.length === 1 && only !== undefined)) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: ins.seat,
        source: res.object,
        purpose: 'split',
        zone: 'exile',
        legal: cards,
        min: 1,
        max: 1,
        reveal: true,
        prompt:
          'Choose one of the exiled cards: it goes on the bottom of their owner’s library; the other returns to the battlefield tapped.',
      },
    };
  }
  const chosen = ins.chosen?.[0] ?? only;
  if (chosen === undefined) return done(state);
  const rest = cards.filter((id) => id !== chosen);
  return done(
    state,
    [],
    [
      ...moveInstructions([chosen], 'library', 'bottom'),
      ...moveInstructions(rest, 'battlefield', 'top', true, 'you'),
    ],
  );
}
