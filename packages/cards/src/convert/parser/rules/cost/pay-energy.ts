/**
 * Costs of the Aetherdrift energy deck (issue 105): "Pay {E}{E}", "Pay six {E}", "Pay fifty {E}" (CR 107.14: the energy symbol is one energy counter, and paying it
 * removes one from the player; CR 118.3: a player can't pay what they don't have). A cost of an ordinary activated ability or of a mana ability.
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCost } from '../../ir/types';
import { quantity } from '../amount';
import { EQUAL_AMOUNTS } from '../amount/scaled';
import { defineRule, family, node } from '../registry';

/** The one number word above twenty that energy costs use ("Pay fifty {E}"). */
const fifty = map(pattern(/fifty(?![\p{L}\p{N}])/iu), () => 50);

/**
 * `cost.pay-energy`: "Pay {E}", "Pay {E}{E}{E}", "Pay six {E}", "Pay 8 {E}", "Pay fifty {E}". Not read: "Pay {1}{E}", "Pay X {E}", "Pay {E} life", "Pay zero {E}", "Pay {E}{E}{E}{E}{E}{E}{E}{E}{E}" is
 * read (a run of symbols has no limit here).
 */
export const COST_PAY_ENERGY = defineRule<IrCost>({
  id: 'cost.pay-energy',
  family: 'cost',
  leading: ['pay'],
  cites: ['CR 107.14 (Energy)', 'CR 118.3 (Costs)'],
  examples: [
    'Pay {E}',
    'Pay {E}{E}',
    'Pay {E}{E}{E}{E}',
    'Pay six {E}',
    'Pay eight {E}',
    'Pay fifty {E}',
  ],
  rejects: [
    'Pay {1}{E}',
    'Pay X {E}',
    'Pay {E} life',
    'Pay zero {E}',
    'Pay',
    'Pay {E',
    'Pay {E}{R}',
    'Pay 0 {E}',
  ],
  parse: node<number, IrCost>(
    'cost.pay-energy',
    choice(
      map(pattern(/pay ((?:\{E\})+)(?![\p{L}\p{N}{])/iu), (m) => (m[1] ?? '').length / 3),
      map(
        sequence(
          literal('pay '),
          choice(
            fifty,
            satisfy(quantity, (n) => n >= 1),
          ),
          pattern(/ \{E\}(?![\p{L}\p{N}{])/u),
        ),
        ([, count]) => count,
      ),
    ),
    (count) => ({ kind: 'energy', count }),
  ),
});

/**
 * `cost.pay-energy-amount`: "pay an amount of {E} equal to that permanent's mana value" (issue 105, Confiscation Coup; CR 107.14, 118.3, 608.2c): the energy the offer asks for is a value worked
 * out as the offer resolves. Read after "may" in an offer (`effect.pay`) only. Not read: a fixed number, "pay an amount of {1}", an amount with no "equal to" phrase.
 */
export const COST_PAY_ENERGY_AMOUNT = defineRule<IrCost>({
  id: 'cost.pay-energy-amount',
  family: 'cost',
  leading: ['pay'],
  cites: ['CR 107.14 (Energy)', 'CR 118.3 (Costs)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ["pay an amount of {E} equal to that permanent's mana value"],
  rejects: [
    'pay an amount of {E}',
    'pay an amount of {1} equal to its mana value',
    'pay {E}{E}',
    'pay an amount of energy equal to its mana value',
    "pays an amount of {E} equal to that permanent's mana value",
  ],
  parse: node<IrAmount, IrCost>(
    'cost.pay-energy-amount',
    map(
      sequence(
        literal('pay an amount of {E} '),
        family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
      ),
      ([, amount]) => amount,
    ),
    (amount) => ({ kind: 'energyAmount', amount }),
  ),
});

export const PAY_ENERGY_COST_RULES = [COST_PAY_ENERGY, COST_PAY_ENERGY_AMOUNT];
