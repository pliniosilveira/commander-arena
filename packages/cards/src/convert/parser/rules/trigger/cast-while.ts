/**
 * Trigger rules of the Azula deck (issue 597): "Whenever you cast a spell while ~ is attacking" (CR 603.2: the words after "while" say when the event must happen, which the ability
 * reads once as it happens; an intervening "if" is read again as the ability resolves, CR 603.4, and is a different thing).
 */
import { fail, literal, sequence } from '../../combinators';
import type { IrCondition, IrTrigger } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `trigger.cast-while`: "you cast a spell while ~ is attacking" (CR 601.2i, 603.2, 506.4). Tried before `trigger.cast`, whose phrase is a prefix of this one; the event and its
 * subject are those of `trigger.cast`, the condition the engine's `triggerCondition`.
 */
export const TRIGGER_CAST_WHILE = defineRule<IrTrigger>({
  id: 'trigger.cast-while',
  family: 'trigger',
  leading: ['you', 'a', 'an'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 506.4 (Combat Phase)',
  ],
  examples: [
    'you cast a spell while ~ is attacking',
    'you cast an instant or sorcery spell while ~ is attacking',
    'an opponent casts a spell while ~ is attacking',
  ],
  rejects: [
    'you cast a spell',
    'you cast a spell while',
    'you cast a spell while ~ is',
    'you cast a spell while ~ is attacking and',
    'you cast a spell while it is attacking',
    'you cast a spell while ~ is blocking',
    'you cast a spell while ~ is attacking or dies',
  ],
  parse: (ctx, pos) => {
    const cast = family<IrTrigger>('trigger', { only: ['trigger.cast'] })(ctx, pos);
    if (!cast.ok) return cast;
    const test = sequence(
      literal(' while '),
      family<IrCondition>('condition', { only: ['condition.this-attacking'] }),
    )(ctx, cast.pos);
    if (!test.ok) return fail(ctx, cast.pos);
    return {
      ok: true,
      value: {
        ...cast.value,
        whileCondition: test.value[1],
        span: { start: pos, end: test.pos },
        rule: 'trigger.cast-while',
      },
      pos: test.pos,
    };
  },
});

export const CAST_WHILE_TRIGGER_RULES = [TRIGGER_CAST_WHILE];
