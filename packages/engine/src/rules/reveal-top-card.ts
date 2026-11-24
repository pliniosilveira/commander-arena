/**
 * "Scry 3, then reveal the top card of your library. Draw cards equal to that card's mana value." (CR 701.20a Reveal, 400.7j, 202.3): the `revealTopCard` effect. Each player the
 * selector names reveals the top card of their own library (a `cardsRevealed` event, public); the card stays where it is. The card revealed is what `moved` names for the effects
 * after it in the same sequence, so "that card's mana value" is read from it; when nothing was revealed (an empty library) `moved` is empty. With several players `moved` holds every card
 * revealed, in the order of the players.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { derive } from './derive';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type RevealTopCard = Extract<Effect, { kind: 'revealTopCard' }>;

export function runRevealTopCard(
  state: GameState,
  effect: RevealTopCard,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const events: GameEvent[] = [];
  let revealed: readonly ObjectId[] = [];
  const seats: SeatId[] = resolvePlayers(state, effect.player, ctx, targets);
  for (const seat of seats) {
    const top = getSeat(state, seat).library[0];
    const card = top === undefined ? undefined : state.objects[top];
    if (top === undefined || card === undefined || card.card === null) continue;
    events.push({
      kind: 'cardsRevealed',
      seat,
      cards: [card.card],
      names: [derive(state, card).name],
      from: 'library',
    });
    revealed = [...revealed, top];
  }
  return { ...done(state, events), lastMoved: revealed };
}
