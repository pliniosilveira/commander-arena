/**
 * The "unless" of a permanent that escaped (stage P23, D-124, CR 702.138b): "sacrifice it unless it escaped".
 * The sentence rules attach it to the one clause it follows (`IrClause.condition`); the condition says when the
 * clause applies, which is when the permanent did NOT escape (CR 702.138b: it was cast with its escape cost), so
 * the node is `not escaped`. The lowering of a triggered ability moves it to the ability's intervening "if"
 * (CR 603.4), where the engine checks it as the event happens and again on resolution.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.unless-escaped`: "unless it escaped". Only the pronoun "it" is read (the real wording of Uro,
 * Kroxa and Phlage); "unless ~ escaped" and every other form is not, so the condition is never a guess about
 * which object escaped.
 */
export const CONDITION_UNLESS_ESCAPED = defineRule<IrCondition>({
  id: 'condition.unless-escaped',
  family: 'condition',
  leading: ['unless'],
  cites: ['CR 702.138b (Escape)', 'CR 702.138a (Escape)', 'CR 603.4 (Triggered Abilities)'],
  examples: ['unless it escaped'],
  rejects: [
    'unless ~ escaped',
    'unless you escaped',
    'unless it was escaped',
    'unless it escapes',
    'unless it escape',
    'unless it escapedx',
    'unless it',
    'if it escaped',
    'unless that creature escaped',
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`unless it escaped${BOUNDARY}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const escaped: IrCondition = {
      kind: 'condition',
      test: { kind: 'escaped' },
      span,
      rule: 'condition.unless-escaped',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'not', term: escaped },
        span,
        rule: 'condition.unless-escaped',
      },
      pos: r.pos,
    };
  },
});
