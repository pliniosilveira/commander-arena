/**
 * The Aetherdrift energy deck (issue 105): "pay one or more {E}" (CR 107.14, 118.1, 118.3): the player chooses how many energy counters to pay, from one to as many as they have.
 * "You may" makes it an offer; the sentence after it ("If you do, ..." or "When you do, ...") says what it buys, and the lowering of the sentences reads the two.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.pay-energy-any';

export const EFFECT_PAY_ENERGY_ANY = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['pay'],
  cites: ['CR 107.14 (Energy)', 'CR 118.1 (Costs)', 'CR 118.3 (Costs)'],
  examples: ['pay one or more {E}'],
  rejects: [
    'pay one or more {R}',
    'pay one or more {E}{E}',
    'pay any amount of {E}',
    'pay one or more',
    'pay {E}',
    'pay two or more {E}',
    'pays one or more {E}',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/pay one or more \{E\}(?![\p{L}\p{N}{])/u)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(RULE, 'payEnergyAny', {}, { start: pos, end: r.pos })],
      pos: r.pos,
    };
  },
});
