/**
 * Costs of the Aetherdrift energy deck (issue 105): "Pay {E}{E}", "Pay six {E}", "Pay fifty {E}" (CR 107.14: the energy symbol is one energy counter, and paying it
 * removes one from the player; CR 118.3: a player can't pay what they don't have). A cost of an ordinary activated ability or of a mana ability.
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { quantity } from '../amount';
import { defineRule, node } from '../registry';

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

export const PAY_ENERGY_COST_RULES = [COST_PAY_ENERGY];
