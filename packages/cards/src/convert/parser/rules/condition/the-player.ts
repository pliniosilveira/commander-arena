/**
 * Condition rules of the Federation Fleet deck (group B): "If the player is your opponent and has four or more cards in hand, ~ deals 2 damage to that player." (Fevered Visions: the
 * player is the one whose end step it is, "that player" of the sentence before).
 */
import { fail, type Parser, pattern } from '../../combinators';
import type { IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/** "has four or more cards in hand": a number of 1 or more, at least that many cards in the hand (CR 402.1). */
const HAS_CARDS_IN_HAND: Parser<IrComparison> = (ctx, pos) => {
  const head = pattern(/has /iu)(ctx, pos);
  if (!head.ok) return head;
  const n = quantity(ctx, head.pos);
  if (!n.ok) return n;
  if (n.value < 1) return fail(ctx, pos);
  const tail = pattern(new RegExp(` or more cards in hand${BOUNDARY}`, 'iu'))(ctx, n.pos);
  if (!tail.ok) return tail;
  return { ok: true, value: { cmp: 'atLeast', value: n.value }, pos: tail.pos };
};

const IS_YOUR_OPPONENT = pattern(new RegExp(`is your opponent${BOUNDARY}`, 'iu'));

function condition(
  start: number,
  end: number,
  opponent: boolean,
  cardsInHand?: IrComparison,
): IrCondition {
  return {
    kind: 'condition',
    test: {
      kind: 'thePlayerIs',
      ...(opponent ? { opponent: true as const } : {}),
      ...(cardsInHand === undefined ? {} : { cardsInHand }),
    },
    span: { start, end },
    rule: 'condition.the-player-is-opponent-with-cards',
  };
}

/**
 * `condition.the-player-is-opponent-with-cards`: "the player is your opponent and has four or more cards in hand", "the player is your opponent", "the player has four or more cards in
 * hand" (CR 603.2b, 102.2, 402.1: the player of the event of the trigger, as the instruction comes up, CR 608.2c). "The player" is the player the trigger is about, which only a lowering
 * that has one reads: the engine's `triggerPlayerIsOpponent` and `triggerPlayerStat`. Not read: "that player" (another noun), "an opponent", "or fewer", a number of zero, "no cards", the hand
 * of "you", a word after the count.
 */
export const CONDITION_THE_PLAYER_OPPONENT_WITH_CARDS = defineRule<IrCondition>({
  id: 'condition.the-player-is-opponent-with-cards',
  family: 'condition',
  leading: ['the'],
  cites: [
    'CR 603.2b (Triggered Abilities)',
    'CR 102.2 (Players)',
    'CR 402.1 (Hand)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'the player is your opponent and has four or more cards in hand',
    'the player is your opponent and has 3 or more cards in hand',
    'the player is your opponent',
    'the player has four or more cards in hand',
  ],
  rejects: [
    'the player is your opponent and has four or fewer cards in hand',
    'the player is your opponent and has zero or more cards in hand',
    'the player is your opponent and has four or more cards',
    'the player is your opponent and has four or more cards in hand.',
    'the player is your opponent and',
    'the player is your opponents',
    'the player is you',
    'the player has four or more cards',
    'the player has no cards in hand',
    'the players is your opponent',
    'that player is your opponent',
    'an opponent has four or more cards in hand',
  ],
  parse: (ctx, pos) => {
    const lead = pattern(/the player /iu)(ctx, pos);
    if (!lead.ok) return lead;
    const opponent = IS_YOUR_OPPONENT(ctx, lead.pos);
    if (!opponent.ok) {
      const cards = HAS_CARDS_IN_HAND(ctx, lead.pos);
      if (!cards.ok) return cards;
      return { ok: true, value: condition(pos, cards.pos, false, cards.value), pos: cards.pos };
    }
    const and = pattern(/ and /iu)(ctx, opponent.pos);
    if (!and.ok) return { ok: true, value: condition(pos, opponent.pos, true), pos: opponent.pos };
    const cards = HAS_CARDS_IN_HAND(ctx, and.pos);
    if (!cards.ok) return cards;
    return { ok: true, value: condition(pos, cards.pos, true, cards.value), pos: cards.pos };
  },
});

export const THE_PLAYER_CONDITION_RULES = [CONDITION_THE_PLAYER_OPPONENT_WITH_CARDS];
