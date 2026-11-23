/**
 * "You may pay {4}. If you do, untap ~." (stage P21, CR 118.3, 608.2c, the engine's `mayPay`, D-120): the
 * first sentence is the offer, a clause `pay` that the sentence's "you may" makes optional, and the
 * sentence after it ("If you do, ...", `condition.if-you-do`) is what the payment buys. The two are read
 * as sentences of their own and joined by the lowering (`lower/sentences.ts`): a payment with no "If you
 * do" after it, or an "If you do" with no payment before it, is read and not run. The cost is what the
 * engine pays for a `mayPay`: plain or hybrid mana, or a payment of life; and since Lorehold group 1 (CR 118.3, 701.9: "you may pay {1} and discard a card. If you do, draw a card.") mana and
 * cards discarded, which the engine pays as Ward's discard is paid, any cards of the hand: the mana first, then " and ", then the discard. No X (CR 107.3j), no other "and" between two
 * costs and no other cost ("sacrifice").
 */
import { choice, literal, map, optional, sequence } from '../../combinators';
import type { IrAmount, IrCost } from '../../ir/types';
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
  examples: [
    'pay {4}',
    'pay {1}{G}',
    'pay {W/B}',
    'pay 2 life',
    'pay {E}{E}{E}',
    "pay an amount of {E} equal to that permanent's mana value",
    'pay eight {E}',
    'pay three life',
    'pay that much life',
    'pay {1} and discard a card',
    'pay {2}{R} and discard two cards',
  ],
  rejects: [
    'pay {1} and discard',
    'pay {1} and discard a creature card',
    'pay {1} and discard a card at random',
    'pay {1} and discard this card',
    'pay {1} and discard a card and draw a card',
    'pay {1}, discard a card',
    'pay 2 life and discard a card',
    'pay {X} and discard a card',
    'pay and discard a card',
    'pay {1} and discard X cards',
    'pay {1} and discard your hand',
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
    'pay {1}{E}',
    'pay an amount of {E}',
    'pay an amount of {1} equal to its mana value',
    'pay zero {E}',
  ],
  parse: map(
    spanned(
      choice<readonly IrCost[]>(
        map(
          sequence(
            literal('pay '),
            family<IrCost>('cost', { only: ['cost.mana', 'cost.mana-hybrid'] }),
            // Lorehold group 1: "pay {1} and discard a card".
            optional(
              map(
                sequence(literal(' and '), family<IrCost>('cost', { only: ['cost.discard'] })),
                ([, discard]) => discard,
              ),
              null,
            ),
          ),
          ([, cost, discard]): readonly IrCost[] => (discard === null ? [cost] : [cost, discard]),
        ),
        map(
          sequence(
            literal('pay X life, '),
            family<IrAmount>('amount', { only: ['amount.where-x'] }),
          ),
          ([, amount]): readonly IrCost[] => [
            {
              kind: 'payLife',
              amount,
              definesX: true,
              span: amount.span,
              rule: RULE,
            },
          ],
        ),
        // Issue 105 (CR 107.14): "pay {E}{E}{E}", "pay eight {E}": energy counters, the cost of an offer.
        map(
          family<IrCost>('cost', { only: ['cost.pay-energy', 'cost.pay-energy-amount'] }),
          (cost): readonly IrCost[] => [cost],
        ),
        // Issue 105 (CR 107.14): "pay {E}{E}{E}", "pay eight {E}": energy counters, the cost of an offer.
        map(family<IrCost>('cost', { only: ['cost.pay-energy'] }), (cost): readonly IrCost[] => [
          cost,
        ]),
        // D-364: "pay that much life", the life that caused the trigger of a life gain.
        map(
          family<IrCost>('cost', { only: ['cost.pay-life', 'cost.pay-life-that-much'] }),
          (cost): readonly IrCost[] => [cost],
        ),
      ),
    ),
    ({ value: costs, span }): Clauses => [
      makeClause(
        RULE,
        'pay',
        { cost: { kind: 'costList', costs: [...costs], span, rule: RULE } },
        span,
      ),
    ],
  ),
});
