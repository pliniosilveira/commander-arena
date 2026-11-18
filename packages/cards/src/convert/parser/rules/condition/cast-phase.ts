/**
 * The condition of a spell cast in its controller's main phase (issue 244, Return to Dust): "you cast ~ during your main phase" (CR 601.2, 505.1), read after the "if"
 * of a sentence of a spell. The engine reads it from the spell (`castInOwnMainPhase`).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.cast-in-own-main-phase`: "you cast ~ during your main phase" (the card's own name, or "this spell" before normalization). Not read: another player, another phase
 * ("during combat", "during an opponent's turn"), "a" spell, or one of the main phases only ("during your first main phase").
 */
export const CONDITION_CAST_IN_OWN_MAIN_PHASE = defineRule<IrCondition>({
  id: 'condition.cast-in-own-main-phase',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 601.2 (Casting Spells)', 'CR 505.1 (Main Phase)'],
  examples: ['you cast ~ during your main phase', 'You cast ~ during your main phase'],
  rejects: [
    'you cast ~ during combat',
    'you cast ~ during an opponent’s turn',
    'you cast a spell during your main phase',
    'you cast ~ during your first main phase',
    'you cast ~ during their main phase',
    'you cast it during your main phase',
    'you cast ~ during your main phase.',
    'an opponent casts ~ during your main phase',
    'you cast ~',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you cast ~ during your main phase(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'castInOwnMainPhase' },
        span,
        rule: 'condition.cast-in-own-main-phase',
      },
      pos: r.pos,
    };
  },
});
