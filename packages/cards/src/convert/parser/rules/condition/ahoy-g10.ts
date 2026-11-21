/**
 * Condition rule of group 10 of the Ahoy Mateys deck: "you have one or fewer cards in hand" (Arm-Mounted Anchor: "This ability costs {2} less to activate if you have one or fewer cards
 * in hand.").
 */
import { fail, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount, IrComparison, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/** "one or fewer", "no more than two": the comparison of a whole number of cards (a number below zero is no way a card says it). */
const OR_FEWER: Parser<IrComparison> = (ctx, pos) => {
  const n = quantity(ctx, pos);
  if (!n.ok) return n;
  if (n.value < 1) return fail(ctx, pos);
  const tail = pattern(/ or fewer(?= cards in hand(?![\p{L}\p{N}]))/iu)(ctx, n.pos);
  if (!tail.ok) return tail;
  return { ok: true, value: { cmp: 'atMost', value: n.value }, pos: tail.pos };
};

/**
 * `condition.you-have-few-cards-in-hand`: "you have one or fewer cards in hand" (CR 402.1: the hand is where a player holds the cards they have drawn; CR 601.2f, 602.2b: the cost of
 * an ability is worked out as it is activated, so the condition is read then). The number of cards in the controller's own hand compared with a number: the engine's `amountIs` of a
 * `countOf` cards in your hand. Not read: another player ("a player", "an opponent"), "or more", a missing "in hand", "in your hand" (said with "your"), a number of zero, "no cards".
 */
export const CONDITION_YOU_HAVE_FEW_CARDS_IN_HAND = defineRule<IrCondition>({
  id: 'condition.you-have-few-cards-in-hand',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 402.1 (Hand)',
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'you have one or fewer cards in hand',
    'you have two or fewer cards in hand',
    'you have 3 or fewer cards in hand',
  ],
  rejects: [
    'you have one or fewer cards',
    'you have fewer cards in hand',
    'you have one or more cards in hand',
    'you have no cards in hand',
    'you have zero or fewer cards in hand',
    'you have one or fewer cards in your hand',
    'you have one or fewer cards in hand.',
    'an opponent has one or fewer cards in hand',
    'a player has one or fewer cards in hand',
    'you control one or fewer cards in hand',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you have /iu),
      OR_FEWER,
      pattern(new RegExp(` cards in hand${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = {
      kind: 'countOf',
      of: {
        kind: 'noun',
        det: 'each',
        filter: {
          zone: 'hand',
          controller: 'you',
          card: true,
          raw: ctx.text.slice(pos, r.pos),
        },
        upTo: false,
        plural: true,
        other: false,
        span,
        rule: 'condition.you-have-few-cards-in-hand',
      },
      span,
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: r.value[1] },
        span,
        rule: 'condition.you-have-few-cards-in-hand',
      },
      pos: r.pos,
    };
  },
});

export const AHOY_G10_CONDITION_RULES = [CONDITION_YOU_HAVE_FEW_CARDS_IN_HAND];
