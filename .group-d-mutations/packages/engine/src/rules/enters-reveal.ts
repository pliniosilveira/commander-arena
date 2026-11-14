/**
 * "As this land enters, you may reveal a Mountain or Plains card from your hand. If you don't, this land enters tapped" and "you may behold a Jace" (CR 614.1c,
 * 614.12, 701.20, 701.4, D-208). The question is the one of a shock land (`confirmOptional`, answered with `entersPaid`) without a cost: accepting reveals a card
 * of the hand the replacement's filter matches, or, for behold, chooses a permanent the controller controls that matches (a permanent is only chosen, not
 * revealed). With more than one card to reveal the player chooses which (D-225); the game does not depend on it, only what the opponent learns does.
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { matchesFilter } from './select';

type Reveal = Extract<Replacement, { kind: 'entersTappedUnlessReveals' }>;

/** The cards of `seat`'s hand and, for behold, the permanents they control that qualify (the land that enters is not one of them). */
export function revealCandidates(
  state: GameState,
  seat: SeatId,
  rule: Reveal,
  entering: ObjectId,
): { readonly hand: readonly ObjectId[]; readonly permanents: readonly ObjectId[] } {
  const ctx = { controller: seat, source: entering };
  const hand = getSeat(state, seat).hand.filter((id) => {
    const card = state.objects[id];
    return (
      id !== entering &&
      card !== undefined &&
      matchesFilter(state, card, { ...rule.filter, zone: 'hand' }, ctx)
    );
  });
  const permanents =
    rule.fromBattlefield === true
      ? state.battlefield.filter((id) => {
          const obj = state.objects[id];
          return (
            obj !== undefined &&
            controllerOf(state, obj) === seat &&
            matchesFilter(
              state,
              obj,
              { ...rule.filter, zone: 'battlefield', controller: 'you' },
              ctx,
            )
          );
        })
      : [];
  return { hand, permanents };
}

/** Whether anything qualifies, so the question is worth asking (CR 701.4a: with nothing to reveal or choose it enters tapped). */
export function canReveal(
  state: GameState,
  seat: SeatId,
  rule: Reveal,
  entering: ObjectId,
): boolean {
  const { hand, permanents } = revealCandidates(state, seat, rule, entering);
  return hand.length > 0 || permanents.length > 0;
}

/**
 * The cards of the hand the player may choose to reveal when there is more than one and no permanent to choose instead (D-225, CR 701.20a: the player
 * chooses which card to reveal; with a permanent to choose for a behold nothing is revealed, which is what a player would choose). Empty with none or one.
 */
export function revealChoices(
  state: GameState,
  seat: SeatId,
  rule: Reveal,
  entering: ObjectId,
): readonly ObjectId[] {
  const { hand, permanents } = revealCandidates(state, seat, rule, entering);
  return permanents.length > 0 || hand.length < 2 ? [] : hand;
}

/**
 * The events of revealing: a permanent is only chosen, so a card of the hand is revealed only when no permanent qualifies. `chosen` is the card the player
 * chose among several (D-225); with one candidate it is that one.
 */
export function revealEvents(
  state: GameState,
  seat: SeatId,
  rule: Reveal,
  entering: ObjectId,
  chosen?: ObjectId,
): GameEvent[] {
  const { hand, permanents } = revealCandidates(state, seat, rule, entering);
  const id =
    permanents.length > 0
      ? undefined
      : chosen !== undefined && hand.includes(chosen)
        ? chosen
        : hand[0];
  const card = id === undefined ? undefined : state.objects[id];
  if (id === undefined || card === undefined || card.card === null) return [];
  return [
    {
      kind: 'cardsRevealed',
      seat,
      cards: [card.card],
      names: [derive(state, card).name],
      from: 'hand',
    },
  ];
}
