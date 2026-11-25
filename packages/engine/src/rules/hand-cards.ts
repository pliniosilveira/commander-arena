/**
 * "Target opponent chooses X cards from their hand. Look at those cards." and "Look at that player's hand." (Extract Brain, Silent-Blade Oni; CR 608.2d, 402.3): the `handCards`
 * effect, run as one instruction that asks at most once. Nothing is moved: the cards named stay in the hand and are what `moved` names afterwards, for the `castFree` with `fromHand`
 * that reads them. With `count` the player the effect names chooses that many cards of their own hand (a `chooseCards` decision of purpose `handChoice`, the cards hidden from the other
 * players; nothing is asked when the hand holds no more than that many, or when the player has none); without it every card of the hand is named.
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import { getSeat } from '../state/ops';
import type { ChosenTarget, GameState, Instruction, ResolutionContext } from '../state/types';
import { amountOf } from './effect-support';
import { resolvePlayers, type SelectContext } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type HandCards = Extract<Instruction, { kind: 'handCards' }>;

/** The effect as it starts: the one player it names, and the cards of their hand to choose from. */
export function startHandCards(
  state: GameState,
  effect: Extract<Effect, { kind: 'handCards' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const [seat] = resolvePlayers(state, effect.player, ctx, targets);
  if (seat === undefined) return { ...done(state), lastMoved: [] };
  const cards = getSeat(state, seat).hand;
  const count = effect.count === undefined ? undefined : amountOf(state, effect.count, ctx, []);
  // Every card of the hand, or all there are when the hand holds no more than the player must choose: nothing to choose.
  if (count === undefined || count >= cards.length) return { ...done(state), lastMoved: cards };
  if (count <= 0) return { ...done(state), lastMoved: [] };
  return done(state, [], [{ kind: 'handCards', seat, count, cards, chosen: null }]);
}

export function runHandCards(
  state: GameState,
  res: ResolutionContext,
  ins: HandCards,
): StepOutcome {
  // A card that left the hand since is a new object (CR 400.7): it is no longer one of the cards.
  const cards = ins.cards.filter((id) => state.objects[id]?.zone === 'hand');
  if (ins.chosen === null) {
    const count = Math.min(ins.count, cards.length);
    if (count >= cards.length) return { ...done(state), lastMoved: cards };
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: ins.seat,
        source: res.object,
        purpose: 'handChoice',
        zone: 'hand',
        legal: cards,
        min: count,
        max: count,
        reveal: false,
        prompt: `Choose ${count === 1 ? 'a card' : `${count} cards`} from your hand for ${info?.name ?? 'this effect'}.`,
      },
    };
  }
  const picked: readonly ObjectId[] = ins.chosen.filter((id) => cards.includes(id));
  return { ...done(state), lastMoved: picked };
}
