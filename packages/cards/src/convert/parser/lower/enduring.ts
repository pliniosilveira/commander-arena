/**
 * Lowerings of the Enduring cycle (deck support issue 578, Enduring Tenacity): the instruction that makes the card an enchantment after it returned.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "It's an enchantment." (CR 205.1a, 613.1d, 611.2a): the permanent the instruction before put onto the battlefield (the engine's `moved`) has the card type enchantment and no
 * other, and so no creature type (CR 205.3d), for good. After any other instruction "it" may name something else, so the sentence is not lowered.
 */
const BECOMES_ONLY_ENCHANTMENT: Lowering<IrClause, Effects> = {
  head: 'becomesOnlyEnchantment',
  id: 'lower.becomes-only-enchantment',
  needs: ['effect:setTypes', 'selector:moved'],
  lower: (clause, ctx) => {
    if (ctx.movedOnto === null) return failure(clause);
    const effect: Effect = {
      kind: 'setTypes',
      objects: { kind: 'moved' },
      types: ['enchantment'],
      duration: 'permanent',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const ENDURING_LOWERINGS = [BECOMES_ONLY_ENCHANTMENT];
