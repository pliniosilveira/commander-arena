/**
 * Condition of coven cards (Augur of Autumn): "you control three or more creatures with different powers" (CR 208.1: power; CR 603.4, 611.3a).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

/**
 * `condition.control-different-powers`: "you control three or more creatures with different powers" (CR 208.1, 613.4): at least that many different powers among the creatures its
 * subject controls, each power counted once however many creatures have it (so a 1/1, a 2/1 and another 2/1 are two different powers, not three, and the count is of the powers
 * the creatures have now). The engine's `amountIs` of a `differentPowersAmong`, worked out when the condition is read. Not read: fewer, no number, "creatures with the same power",
 * "different toughnesses", another controller, a card type other than creature, "other".
 */
export const CONDITION_CONTROL_DIFFERENT_POWERS = defineRule<IrCondition>({
  id: 'condition.control-different-powers',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 208.1 (Power and Toughness)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 611.3a (Continuous Effects from Static Abilities)',
  ],
  examples: [
    'you control three or more creatures with different powers',
    'you control two or more creatures with different powers',
    'you control 3 or more creatures with different powers',
  ],
  rejects: [
    'you control three or more creatures with different powers.',
    'you control three or more creatures with the same power',
    'you control three or more creatures with different toughnesses',
    'you control three or more creatures',
    'you control three or fewer creatures with different powers',
    'you control three or more artifacts with different powers',
    'you control three or more other creatures with different powers',
    'you control a creature with different powers',
    'an opponent controls three or more creatures with different powers',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you control '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ or more creatures with different powers(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const count = r.value[1];
    const span = { start: pos, end: r.pos };
    const of = {
      kind: 'noun' as const,
      det: 'a' as const,
      filter: { types: ['creature'], controller: 'you' as const, raw: 'creatures you control' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: 'condition.control-different-powers',
    };
    const amount: IrAmount = { kind: 'differentPowersAmong', of, span };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'amountIs',
          amount,
          compare: { cmp: 'atLeast', value: count.value },
        },
        span,
        rule: 'condition.control-different-powers',
      },
      pos: r.pos,
    };
  },
});

export const DIFFERENT_POWERS_CONDITION_RULES = [CONDITION_CONTROL_DIFFERENT_POWERS];
