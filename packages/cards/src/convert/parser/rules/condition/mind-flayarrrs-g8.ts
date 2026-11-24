/**
 * Condition of the Mind Flayarrrs deck, group 8 (Nihilith): "this card is suspended" (CR 702.62b, 603.4), the intervening "if" of an ability that works from exile.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.this-suspended`: "~ is suspended", "this card is suspended" (CR 702.62b: a card is suspended if it's in exile, has suspend, and has a time counter on it; CR 603.4, 400.7). The
 * engine's `thisSuspended`, which the lowering of a triggered ability accepts as its intervening "if" and then makes an ability that works from exile. Not read: another card ("that card
 * is suspended", "target card"), a negation, a past tense, "suspended" with more words after it.
 */
export const CONDITION_THIS_SUSPENDED = defineRule<IrCondition>({
  id: 'condition.this-suspended',
  family: 'condition',
  leading: ['~', 'this'],
  cites: ['CR 702.62b (Suspend)', 'CR 603.4 (Handling Triggered Abilities)', 'CR 400.7 (General)'],
  examples: ['~ is suspended', 'this card is suspended'],
  rejects: [
    '~ is not suspended',
    '~ isn’t suspended',
    '~ was suspended',
    '~ is suspended and you control a Mountain',
    '~ is suspended or in your hand',
    'this creature is suspended',
    'that card is suspended',
    'it is suspended',
    '~ is in exile',
    '~ is suspended.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/(?:~|this card) is suspended(?![\p{L}\p{N}.])(?! or )(?! and )/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisSuspended' },
        span: r.value.span,
        rule: 'condition.this-suspended',
      },
      pos: r.pos,
    };
  },
});

export const MIND_FLAYARRRS_G8_CONDITION_RULES = [CONDITION_THIS_SUSPENDED];
