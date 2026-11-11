/**
 * The condition of a kicked spell (CR 702.33d): "~ was kicked" and "it was kicked", read after
 * the "if" of a sentence of a spell ("If ~ was kicked, it deals 4 damage instead.") or of an
 * intervening "if" ("When ~ enters, if it was kicked, ..."). Which object "it" is, is decided by
 * the lowering: the engine reads `kicked` from the spell, or from the permanent the ability
 * belongs to, so "it" is only the source when the ability is about the source itself.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.kicked`: "~ was kicked" (the card's own name, or "this spell" before normalization)
 * and "it was kicked"; also "he was kicked" and "she was kicked" (stage P28: the way the text of a creature with a
 * personal name says "it"). "was kicked with its first kicker" (CR 702.33f) and "was kicked twice" name
 * which of several kicker costs was paid, which the engine does not model, so they are not read.
 */
export const CONDITION_KICKED = defineRule<IrCondition>({
  id: 'condition.kicked',
  family: 'condition',
  leading: ['~', 'it', 'he', 'she'],
  cites: ['CR 702.33d (Kicker)', 'CR 702.33e (Kicker)'],
  examples: ['~ was kicked', 'it was kicked', 'It was kicked', 'he was kicked', 'she was kicked'],
  rejects: [
    '~ was kicked with its first kicker',
    'it was kicked twice',
    '~ was not kicked',
    'it was kicked.',
    'it was',
    'it',
    'you were kicked',
    'that spell was kicked',
    'they were kicked',
    'he was kicked twice',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/(~|it|he|she) was kicked(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const who = r.value[1] === '~' ? ('self' as const) : ('it' as const);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: { kind: 'condition', test: { kind: 'kicked', who }, span, rule: 'condition.kicked' },
      pos: r.pos,
    };
  },
});
