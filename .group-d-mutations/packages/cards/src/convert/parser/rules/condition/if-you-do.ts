/**
 * "If you do," at the start of a sentence (stage P21, CR 608.2c): what the sentence says happens only
 * when the player did what the sentence before offered ("You may pay {4}. If you do, untap ~."). It
 * means something only after a `pay` clause, which the lowering checks; read only in the body of a
 * triggered ability (`sentence.ts`), where the offer can be made.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/** `condition.if-you-do`: "you do", after the "if" the sentence parser reads. */
export const CONDITION_IF_YOU_DO = defineRule<IrCondition>({
  id: 'condition.if-you-do',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 118.3 (Costs)'],
  examples: ['you do', 'You do'],
  rejects: ['you don’t', "you don't", 'you did', 'you do not', 'they do', 'you does', 'you'],
  parse: (ctx, pos) => {
    const r = pattern(/you do(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'didPrevious' },
        span,
        rule: 'condition.if-you-do',
      },
      pos: r.pos,
    };
  },
});
