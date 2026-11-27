/**
 * Effect rule of Rose Room Treasurer (deck support issue 111): the offer "you may pay {X}" whose "When you do, ..." after it buys something that reads X.
 *
 * - `effect.pay-x`: "pay {X}" (CR 107.3f, 118.1, 603.12): an offer of a payment of any number of generic mana, the number being X. The lowering of the sentences reads the offer
 *   and the reflexive ability after it ("When you do, ~ deals X damage to any target") as one engine `payAnyAmount`; anywhere else it is read and not run.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** `effect.pay-x`: "pay {X}" alone, with no condition on X ("where X is ..." is `effect.pay-x-at-most`). */
export const EFFECT_PAY_X = defineRule<Clauses>({
  id: 'effect.pay-x',
  family: 'effect',
  leading: ['pay'],
  cites: [
    'CR 107.3f (Numbers and Symbols)',
    'CR 118.1 (Costs)',
    'CR 603.12 (Handling Triggered Abilities)',
  ],
  examples: ['pay {X}', 'Pay {X}'],
  rejects: [
    'pay X',
    'pay {X}{X}',
    'pay {X}, where X is less than or equal to the amount of life you gained',
    'pay {X} and draw a card',
    'pay {1}',
    'pay any amount of {X}',
    'pay {X}.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`pay \\{X\\}${BOUNDARY}(?!\\{|,| and\\b)`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.pay-x', 'payX', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const PAY_X_REFLEXIVE_EFFECT_RULES = [EFFECT_PAY_X].map(quietly);
