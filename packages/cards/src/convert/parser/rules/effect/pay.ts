/**
 * "You may pay {4}. If you do, untap ~." (stage P21, CR 118.3, 608.2c, the engine's `mayPay`, D-120): the
 * first sentence is the offer, a clause `pay` that the sentence's "you may" makes optional, and the
 * sentence after it ("If you do, ...", `condition.if-you-do`) is what the payment buys. The two are read
 * as sentences of their own and joined by the lowering (`lower/sentences.ts`): a payment with no "If you
 * do" after it, or an "If you do" with no payment before it, is read and not run. The cost is what the
 * engine pays for a `mayPay`: plain or hybrid mana, or a payment of life. No X (CR 107.3j), no "and"
 * between two costs and no other cost ("sacrifice", "discard").
 */
import { choice, literal, map, sequence } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.pay';

/** `effect.pay`: "pay {4}", "pay {W/B}", "pay 2 life": the cost an offer asks for. */
export const EFFECT_PAY = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['pay'],
  cites: [
    'CR 118.3 (Costs)',
    'CR 119.4 (Life)',
    'CR 107.4e (Numbers and Symbols)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['pay {4}', 'pay {1}{G}', 'pay {W/B}', 'pay 2 life', 'pay three life'],
  rejects: [
    'pay',
    'pay {X}',
    'pay {1} and 2 life',
    'pay {G/P}',
    'pay 0 life',
    'pay X life',
    'pay life',
    'pays {1}',
    'pay {1}, then draw a card',
    'pay {T}',
    'pay a card',
  ],
  parse: map(
    spanned(
      choice<IrCost>(
        map(
          sequence(
            literal('pay '),
            family<IrCost>('cost', { only: ['cost.mana', 'cost.mana-hybrid'] }),
          ),
          ([, cost]) => cost,
        ),
        family<IrCost>('cost', { only: ['cost.pay-life'] }),
      ),
    ),
    ({ value: cost, span }): Clauses => [
      makeClause(
        RULE,
        'pay',
        { cost: { kind: 'costList', costs: [cost], span, rule: RULE } },
        span,
      ),
    ],
  ),
});
