/**
 * The condition of the Jeskai free-cast cards (deck support issue 100): "if you cast it", the intervening "if" of a trigger of a permanent about itself.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.was-cast`: "you cast it" (CR 601.2a, 603.4: the permanent came from a spell its controller cast, from any zone; "it" is the permanent the trigger is about, which
 * the lowering requires to be the source itself). The engine's `wasCast`. Not read: "you cast ~ during your main phase" (`condition.cast-in-own-main-phase`), another player,
 * "you cast a spell", another tense, "it was cast".
 */
export const CONDITION_WAS_CAST = defineRule<IrCondition>({
  id: 'condition.was-cast',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 601.2a (Casting Spells)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['you cast it', 'You cast it'],
  rejects: [
    'you cast it during your main phase',
    'you cast a spell',
    'an opponent cast it',
    'you cast them',
    'you cast it from your hand',
    'you didn’t cast it',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you cast it(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'wasCast' },
        span: { start: pos, end: r.pos },
        rule: 'condition.was-cast',
      },
      pos: r.pos,
    };
  },
});

export const JESKAI_CASTFREE_CONDITION_RULES = [CONDITION_WAS_CAST];
