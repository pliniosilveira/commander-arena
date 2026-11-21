/**
 * "Reveal the top card of your library. If it's a creature card, create a 1/1 green Saproling creature token. If it's a land card, put that card onto the battlefield under
 * your control. If it's a noncreature, nonland card, you gain 2 life." and "Whenever ~ attacks, reveal the top card of your library. If it's a creature card, you gain life
 * equal to that card's toughness, lose life equal to its power, then put it into your hand." (CR 701.20a Reveal, 608.2c, 608.2h): the `revealTopBranches` effect. Each player
 * the selector names reveals the top card of their own library once; every branch whose filter matches the card as revealed is then done, in the order written.
 */
import type { Effect } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { matchesFilter, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type RevealTopBranches = Extract<Effect, { kind: 'revealTopBranches' }>;

export function runRevealTopBranches(
  state: GameState,
  res: ResolutionContext,
  effect: RevealTopBranches,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const events: GameEvent[] = [];
  const instructions: Instruction[] = [];
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
    revealed = [top];
    for (const branch of effect.branches) {
      // CR 608.2c: the card is read as it was revealed; a branch that moved it does not change what the later ones saw.
      const matches = matchesFilter(
        state,
        card,
        { ...branch.ifMatches, zone: 'library' },
        { controller: seat, source: res.source },
      );
      if (!matches) continue;
      if (branch.onMatch !== undefined) {
        instructions.push({
          kind: 'effect',
          effect: branch.onMatch,
          as: branch.asController === true ? ctx.controller : seat,
        });
      }
      if (branch.to !== undefined) {
        // The player who revealed it puts it there, so it is under their control (CR 110.2a): its owner, the library being theirs.
        instructions.push(
          ...moveInstructions(
            [top],
            branch.to,
            'top',
            branch.to === 'battlefield' && branch.tapped === true,
            branch.to === 'battlefield' ? 'owner' : undefined,
          ),
        );
      }
    }
  }
  return { ...done(state, events, instructions), lastMoved: revealed };
}
