/**
 * Effect rule of the Case cards (CR 719): the effect of "To solve". The lowering is in `lower/case-solved.ts`.
 */

import { pattern } from '../../combinators';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.become-solved`: "~ becomes solved" (CR 719.3a, 719.3b: the effect of the triggered ability "To solve" stands for, "this Case becomes solved": the Case gets the solved
 * designation). The engine's `solve`. Not read: another permanent ("target Case becomes solved"), "it becomes solved", anything after the word.
 */
export const EFFECT_BECOME_SOLVED = defineRule<Clauses>({
  id: 'effect.become-solved',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 719.3a (Case Cards)', 'CR 719.3b (Case Cards)'],
  examples: ['~ becomes solved'],
  rejects: [
    'it becomes solved',
    'target Case becomes solved',
    '~ becomes solved and you draw a card',
    '~ becomes unsolved',
    '~ becomes',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/~ becomes solved(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    const id = 'effect.become-solved';
    return { ok: true, value: [makeClause(id, 'becomeSolved', {}, r.value.span)], pos: r.pos };
  },
});

export const CASE_EFFECT_RULES = [EFFECT_BECOME_SOLVED];
