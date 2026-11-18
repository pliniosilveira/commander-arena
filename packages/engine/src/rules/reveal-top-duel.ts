/**
 * "You and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you
 * revealed into your hand." (CR 701.20a Reveal, 119.3 Life, 202.3 Mana Value): the `revealTopDuel` effect. Each of the two players reveals the top card of their own library
 * (`cardsRevealed`, public: both players see both cards, CR 701.20a), then each loses life equal to the mana value of the card the OTHER player revealed (a player whose library was
 * empty revealed nothing, so the other loses no life), then each puts the card they revealed into their hand. The mana values are read when the cards are revealed.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { manaValueOfCost } from './mana-value';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type RevealTopDuel = Extract<Effect, { kind: 'revealTopDuel' }>;

export function runRevealTopDuel(
  state: GameState,
  _res: ResolutionContext,
  effect: RevealTopDuel,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const seats: SeatId[] = resolvePlayers(state, effect.players, ctx, targets);
  const events: GameEvent[] = [];
  const revealed: { seat: SeatId; top: ObjectId; value: number }[] = [];
  for (const seat of seats) {
    const top = getSeat(state, seat).library[0];
    const card = top === undefined ? undefined : state.objects[top];
    if (top === undefined || card === undefined || card.card === null) continue;
    const view = derive(state, card);
    events.push({
      kind: 'cardsRevealed',
      seat,
      cards: [card.card],
      names: [view.name],
      from: 'library',
    });
    revealed.push({ seat, top, value: manaValueOfCost(view.manaCost, card) });
  }
  const moves: Instruction[] = [];
  // CR 119.3: each player loses life equal to the mana value of the card revealed by the other player.
  for (const seat of seats) {
    const lost = revealed.filter((r) => r.seat !== seat).reduce((n, r) => n + r.value, 0);
    if (lost > 0) {
      moves.push({
        kind: 'effect',
        effect: { kind: 'loseLife', player: { kind: 'you' }, amount: lost },
        as: seat,
      });
    }
  }
  for (const { top } of revealed) {
    moves.push(...moveInstructions([top], 'hand', 'top', false, undefined));
  }
  return done(state, events, moves);
}
