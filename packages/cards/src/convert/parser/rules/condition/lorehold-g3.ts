/**
 * Condition rules of group 3 of the Lorehold Spirit deck (issue 86): "a player has one or fewer cards in hand" (Naktamun Lorespinner: "At the beginning of your upkeep, if a player has one or
 * fewer cards in hand, this creature becomes prepared.").
 */
import { fail, type Parser, pattern, sequence } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/** "one or fewer", "two or fewer": a number of 1 or more, at most that many (a number below one is no way a card says it). */
const OR_FEWER: Parser<IrComparison> = (ctx, pos) => {
  const n = quantity(ctx, pos);
  if (!n.ok) return n;
  if (n.value < 1) return fail(ctx, pos);
  const tail = pattern(/ or fewer(?= cards in hand(?![\p{L}\p{N}]))/iu)(ctx, n.pos);
  if (!tail.ok) return tail;
  return { ok: true, value: { cmp: 'atMost', value: n.value }, pos: tail.pos };
};

/**
 * `condition.a-player-cards-in-hand`: "a player has one or fewer cards in hand" (CR 402.1: the hand is where a player holds cards that have been drawn; CR 603.4: an intervening "if" is read
 * as the ability would trigger and again as it resolves). Any player in the game, the controller or an opponent: the engine's `aPlayerCardsInHand`. Not read: "an opponent", "each player",
 * "you" (other conditions), "or more" (no card needs it yet), a missing "in hand", a number of zero, "no cards".
 */
export const CONDITION_A_PLAYER_CARDS_IN_HAND = defineRule<IrCondition>({
  id: 'condition.a-player-cards-in-hand',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 402.1 (Hand)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'a player has one or fewer cards in hand',
    'a player has two or fewer cards in hand',
    'a player has 3 or fewer cards in hand',
  ],
  rejects: [
    'a player has one or fewer cards',
    'a player has fewer cards in hand',
    'a player has one card in hand',
    'a player has one or more cards in hand',
    'a player has no cards in hand',
    'a player has zero or fewer cards in hand',
    'a player has one or fewer cards in their hand',
    'a player has one or fewer cards in hand.',
    'an opponent has one or fewer cards in hand',
    'each player has one or fewer cards in hand',
    'a player has one or fewer cards in graveyard',
    'a player controls one or fewer cards in hand',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/a player has /iu),
      OR_FEWER,
      pattern(new RegExp(` cards in hand${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'aPlayerCardsInHand', compare: r.value[1] },
        span: { start: pos, end: r.pos },
        rule: 'condition.a-player-cards-in-hand',
      },
      pos: r.pos,
    };
  },
});

export const LOREHOLD_G3_CONDITION_RULES = [CONDITION_A_PLAYER_CARDS_IN_HAND];
