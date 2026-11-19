/**
 * `condition.it-on-battlefield`: "it's on the battlefield" (issue 89, Animate Dead; CR 603.4 intervening "if", 400.7): the permanent the trigger is about is still on the battlefield, read as
 * the event happens and again as the ability resolves. The engine's `thisOnBattlefield`; the lowering accepts it only as the intervening "if" of a trigger whose every event is the permanent
 * itself ("When ~ enters, if it's on the battlefield, ..."), where "it" is the source. Not read: another zone, "it isn't on the battlefield", "it is on the battlefield" with more words,
 * "that creature is on the battlefield", "you control it".
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';

export const CONDITION_IT_ON_BATTLEFIELD = defineRule<IrCondition>({
  id: 'condition.it-on-battlefield',
  family: 'condition',
  leading: ["it's", 'it’s', 'it'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 400.7 (General)'],
  examples: ["it's on the battlefield", 'it’s on the battlefield', 'it is on the battlefield'],
  rejects: [
    "it's on the stack",
    "it's in a graveyard",
    "it's not on the battlefield",
    "it isn't on the battlefield",
    "it's on the battlefield and untapped",
    "it's on the battlefield or in exile",
    "that creature's on the battlefield",
    '~ is on the battlefield',
    "it's on the battlefield.",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/it(?:['’]s| is) on the battlefield(?![\p{L}\p{N}])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisOnBattlefield' },
        span: r.value.span,
        rule: 'condition.it-on-battlefield',
      },
      pos: r.pos,
    };
  },
});

export const IT_ON_BATTLEFIELD_CONDITION_RULES = [CONDITION_IT_ON_BATTLEFIELD].map(quietly);
