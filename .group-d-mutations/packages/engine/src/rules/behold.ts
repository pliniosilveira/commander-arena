/**
 * "Behold a Dragon" (CR 701.4, D-151): "Reveal a [quality] card from your hand or choose a [quality] permanent you control on the battlefield." The
 * controller answers one `chooseCards` decision (purpose 'behold') whose legal cards are the matching cards of their hand and the matching permanents
 * they control; a card of the hand is revealed (`cardsRevealed`), a permanent is only chosen. Doing it is what "If you do" reads (`performed`). When
 * nothing matches, nothing is asked and nothing was beheld.
 */
import type { ObjectId } from '../ids';
import type { ChooseCardsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type Behold = Extract<Instruction, { kind: 'behold' }>;

/** The cards in `seat`'s hand and the permanents they control that match the filter. */
function candidates(state: GameState, res: ResolutionContext, ins: Behold): ObjectId[] {
  const ctx = { controller: ins.seat, source: res.source };
  const hand = getSeat(state, ins.seat).hand.filter((id) => {
    const card = state.objects[id];
    return card !== undefined && matchesFilter(state, card, { ...ins.filter, zone: 'hand' }, ctx);
  });
  const permanents = state.battlefield.filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === ins.seat &&
      matchesFilter(state, obj, { ...ins.filter, zone: 'battlefield', controller: 'you' }, ctx)
    );
  });
  return [...hand, ...permanents];
}

export function runBehold(state: GameState, res: ResolutionContext, ins: Behold): StepOutcome {
  if (ins.chosen === null) {
    const legal = candidates(state, res, ins);
    if (legal.length === 0) return done(state);
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat: ins.seat,
      source: res.object,
      purpose: 'behold',
      zone: 'hand',
      legal,
      min: 1,
      max: 1,
      reveal: true,
      prompt: 'Behold: reveal a card from your hand or choose a permanent you control',
    };
    return { state, events: [], front: [], needs: decision };
  }
  const [id] = ins.chosen;
  const card = id === undefined ? undefined : state.objects[id];
  if (card === undefined) return done(state);
  const events: GameEvent[] = [];
  // CR 701.4a: a card of the hand is revealed; a permanent is only chosen.
  if (card.zone === 'hand' && card.card !== null) {
    events.push({
      kind: 'cardsRevealed',
      seat: ins.seat,
      cards: [card.card],
      names: [derive(state, card).name],
      from: 'hand',
    });
  }
  return { ...done(state, events), performed: 1 };
}
