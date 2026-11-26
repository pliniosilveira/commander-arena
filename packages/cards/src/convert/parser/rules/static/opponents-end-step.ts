/**
 * Static rule of the Revenant Recon deck (Final-Word Phantom): "During each opponent's end step, you may cast spells as though they had flash." (CR 513.1, 601.3b).
 */
import { fail, literal } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `static.during-opponents-end-step`: "During each opponent's end step, " before the permission of `static.cast-as-though-flash` (CR 601.3b: an effect may let a player cast a
 * spell at a time they could not; CR 513.1: the end step of a turn of another player, whatever the number of opponents). The condition is that of the whole statement, read where
 * the permission is used. Not read: another step or turn ("during your end step"), the permission of every player ("Any player may cast ..."), another statement after the
 * comma, a condition after the statement.
 */
export const STATIC_DURING_OPPONENTS_END_STEP = defineRule<IrStatic>({
  id: 'static.during-opponents-end-step',
  family: 'static',
  leading: ['during'],
  cites: ['CR 513.1 (End Step)', 'CR 601.3b (Casting Spells)'],
  examples: [
    "During each opponent's end step, you may cast spells as though they had flash.",
    "During each opponent's end step, you may cast artifact spells as though they had flash.",
  ],
  rejects: [
    "During each opponent's end step, you may cast spells as though they had flash",
    "During each opponent's end step, any player may cast spells as though they had flash.",
    'During your end step, you may cast spells as though they had flash.',
    "During each opponent's upkeep, you may cast spells as though they had flash.",
    "During each opponent's end step you may cast spells as though they had flash.",
    "During each opponent's end step, you may cast spells as though they had haste.",
    "During each opponent's end step, draw a card.",
  ],
  parse: (ctx, pos) => {
    const lead = literal("during each opponent's end step, ")(ctx, pos);
    if (!lead.ok) return lead;
    const inner = family<IrStatic>('static', { only: ['static.cast-as-though-flash'] })(
      ctx,
      lead.pos,
    );
    if (!inner.ok) return inner;
    const [permission] = inner.value.effects;
    if (
      inner.value.condition !== undefined ||
      permission?.kind !== 'castAsThoughFlash' ||
      permission.anyPlayer === true
    ) {
      return fail(ctx, pos);
    }
    const id = 'static.during-opponents-end-step';
    return {
      ok: true,
      value: {
        ...inner.value,
        condition: {
          kind: 'condition',
          test: { kind: 'opponentsEndStep' },
          span: { start: pos, end: lead.pos },
          rule: id,
        },
        span: { start: pos, end: inner.pos },
        rule: id,
      },
      pos: inner.pos,
    };
  },
});

export const OPPONENTS_END_STEP_STATIC_RULES = [STATIC_DURING_OPPONENTS_END_STEP];
