/**
 * "That source's controller exiles a card from their hand at random" (CR 701.13, 406.3, 400.7; D-1183 provisional): the `exileRandomFromHand` effect.
 *
 * The player the selector names exiles one card of their own hand, chosen by the game's random number generator (the seeded generator stored in the state, so a game replays
 * move for move). Nobody chooses, so no decision is asked, and nothing is learnt before the move: the card is picked inside the engine and is public from the moment it is in
 * exile (exile is a public zone, face up, CR 406.3). The card the effect exiled is what `moved` names afterwards (CR 400.7j: it is a new object in exile), which the "If it's a land
 * card, you may put it onto the battlefield ... Otherwise, you may cast it without paying its mana cost" of the same ability reads; an empty hand does nothing and leaves `moved`
 * empty, so those instructions find no card.
 */
import type { Effect } from '../ast/types';
import { shuffle } from '../rng';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { moveInstructions, moving } from './effect-support';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/** Runs an `exileRandomFromHand` effect: one card of the hand of the player the selector names, at random, goes to exile. */
export function runExileRandomFromHand(
  state: GameState,
  effect: Extract<Effect, { kind: 'exileRandomFromHand' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const [seat] = resolvePlayers(state, effect.player, ctx, targets);
  const hand = seat === undefined ? [] : getSeat(state, seat).hand;
  // An empty hand (or a player who is gone): nothing is exiled, and "it" of the instructions after this one names nothing (CR 400.7j).
  if (hand.length === 0) return { ...done(state), lastMoved: [] };
  const [shuffled, rng] = shuffle(hand, state.rng);
  const [picked] = shuffled;
  if (picked === undefined) return { ...done(state), lastMoved: [] };
  return moving({ ...state, rng }, moveInstructions([picked], 'exile'));
}
