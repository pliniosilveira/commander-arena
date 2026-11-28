/**
 * Static rule of the Peace Offering deck (Twenty-Toed Toad): "Your maximum hand size is twenty." (CR 402.2: a player's maximum hand size is normally seven; CR 514.1: the active
 * player discards down to it in the cleanup step).
 */
import { pattern } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule } from '../registry';

/**
 * `static.maximum-hand-size`: "Your maximum hand size is twenty." (CR 402.2, 514.1; CR 613.11: with "You have no maximum hand size" the later effect decides, which the engine's
 * `maximumHandSize` works out). The controller's own maximum, a whole number. Not read: another player's ("Each opponent's maximum hand size"), a change by an amount ("is reduced by
 * one", "is increased by two"), a condition, "no maximum hand size" (`static.no-maximum-hand-size`).
 */
export const STATIC_MAXIMUM_HAND_SIZE = defineRule<IrStatic>({
  id: 'static.maximum-hand-size',
  family: 'static',
  leading: ['your'],
  cites: [
    'CR 402.2 (Hand)',
    'CR 514.1 (Cleanup Step)',
    'CR 613.11 (Interaction of Continuous Effects)',
  ],
  examples: ['Your maximum hand size is twenty.', 'Your maximum hand size is 10.'],
  rejects: [
    'Your maximum hand size is twenty',
    'Your maximum hand size is reduced by one.',
    'Your maximum hand size is increased by two.',
    "Each opponent's maximum hand size is twenty.",
    'Your maximum hand size is twenty as long as you control a Frog.',
    'Your maximum hand size is X.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/your maximum hand size is /iu)(ctx, pos);
    if (!head.ok) return head;
    const size = quantity(ctx, head.pos);
    if (!size.ok) return size;
    const end = pattern(/\./u)(ctx, size.pos);
    if (!end.ok) return end;
    const subject = {
      kind: 'noun' as const,
      det: 'you' as const,
      filter: { raw: 'Your' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 4 },
      rule: 'static.maximum-hand-size',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'maxHandSize', size: size.value }],
        span: { start: pos, end: end.pos },
        rule: 'static.maximum-hand-size',
      },
      pos: end.pos,
    };
  },
});

export const HAND_SIZE_STATIC_RULES = [STATIC_MAXIMUM_HAND_SIZE];
