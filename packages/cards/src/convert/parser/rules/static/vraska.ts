/**
 * Static rules of the Vraska deck (stage P49, D-206): "During your turn, equipped creature has flying." (Dragoon's Lance).
 */
import { fail, literal } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `static.during-your-turn`: "During your turn, equipped creature has flying." (CR 611.3a, 613.8: the effect applies only while it is your turn, which is
 * looked at all the time and which no layer changes). The statement after the comma is one of an attached permanent (`static.attached`: "equipped
 * creature gets +1/+0 and has flying"), so the condition is that of the whole statement. Not read: another turn ("during an opponent's turn"), a
 * condition after the statement ("equipped creature has flying during your turn"), a subject that is not the attached permanent.
 */
export const STATIC_DURING_YOUR_TURN = defineRule<IrStatic>({
  id: 'static.during-your-turn',
  family: 'static',
  leading: ['during'],
  cites: ['CR 611.3a (Continuous Effects)', 'CR 613.8 (Interaction of Continuous Effects)'],
  examples: [
    'During your turn, equipped creature has flying.',
    'During your turn, equipped creature gets +1/+0 and has first strike.',
  ],
  rejects: [
    'During your turn, equipped creature has flying',
    "During an opponent's turn, equipped creature has flying.",
    'During your turn equipped creature has flying.',
    'During your turn, creatures you control have flying.',
    'During your turn, ~ has flying.',
    'During your turn, draw a card.',
    'During your turn, equipped creature has banana.',
  ],
  parse: (ctx, pos) => {
    const lead = literal('during your turn, ')(ctx, pos);
    if (!lead.ok) return lead;
    const inner = family<IrStatic>('static', { only: ['static.attached'] })(ctx, lead.pos);
    if (!inner.ok) return inner;
    if (inner.value.condition !== undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        ...inner.value,
        condition: {
          kind: 'condition',
          test: { kind: 'yourTurn' },
          span: { start: pos, end: lead.pos },
          rule: 'static.during-your-turn',
        },
        span: { start: pos, end: inner.pos },
        rule: 'static.during-your-turn',
      },
      pos: inner.pos,
    };
  },
});

export const VRASKA_STATIC_RULES = [STATIC_DURING_YOUR_TURN];
