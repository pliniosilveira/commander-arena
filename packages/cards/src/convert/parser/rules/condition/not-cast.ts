/**
 * Condition of Rapid Augmenter: "it wasn't cast" (CR 601.2a, 603.4), the intervening "if" of a trigger about another permanent that enters. The lowering reads it as the engine's
 * `subjectMatches` with `notCast`: the permanent the event is about did not come from a spell that was cast (it was put onto the battlefield by an effect).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

const ID = 'condition.not-cast';

/**
 * `condition.not-cast`: "it wasn't cast" (the permanent that entered did not come from a cast spell). Only the whole phrase. Not read: "it was cast" (the other way round), "they
 * weren't cast", "it wasn't cast from your hand", "it wasn't cast this turn", "you didn't cast it".
 */
export const CONDITION_NOT_CAST = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['it'],
  cites: ['CR 601.2a (Casting Spells)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ["it wasn't cast", 'it wasn’t cast', "It wasn't cast"],
  rejects: [
    'it was cast',
    "they weren't cast",
    "it wasn't cast from your hand",
    "it wasn't cast this turn",
    "it wasn't casting",
    "it wasn't cast or",
    "you didn't cast it",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/it wasn['’]t cast(?![\p{L}\p{N}'’])(?! (?:or|from|this)\b)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'notCast' },
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const NOT_CAST_CONDITION_RULES = [CONDITION_NOT_CAST];
