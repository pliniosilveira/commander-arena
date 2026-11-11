/**
 * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto
 * the battlefield." (D-151, CR 701.20 Reveal): the `revealTop` effect. Each player the selector names reveals the top card of their own library (a
 * `cardsRevealed` event, public); when the filter matches it, it goes onto the battlefield under that player's control or into their hand, and
 * otherwise it stays on top.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { matchesFilter, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type RevealTop = Extract<Effect, { kind: 'revealTop' }>;

export function runRevealTop(
  state: GameState,
  res: ResolutionContext,
  effect: RevealTop,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const events: GameEvent[] = [];
  const moves: Instruction[] = [];
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
    if (
      matchesFilter(
        state,
        card,
        { ...effect.ifMatches, zone: 'library' },
        { controller: seat, source: res.source },
      )
    ) {
      // The player who revealed it puts it onto the battlefield, so it is under their control (CR 110.2a): its owner, the library being theirs.
      moves.push(
        ...moveInstructions(
          [top],
          effect.to,
          'top',
          effect.to === 'battlefield' && effect.tapped === true,
          effect.to === 'battlefield' ? 'owner' : undefined,
        ),
      );
    }
  }
  return done(state, events, moves);
}
