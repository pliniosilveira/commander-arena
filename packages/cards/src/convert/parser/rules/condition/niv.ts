/**
 * Conditions of the Niv-Mizzet deck (issue 25): "five or more mana was spent to cast that spell" (CR 601.2h), the wording the newer cards use for the
 * test `condition.mana-spent-at-least` reads as "at least four mana was spent to cast it". It leads an "If ..., ... instead" sentence of a trigger
 * that is about a spell that was cast; the lowering reads it there only (`ctx.castTrigger`), for "that spell" is the spell that caused the trigger.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

/**
 * `condition.mana-spent-or-more`: "five or more mana was spent to cast that spell" (CR 601.2h: the mana paid for the spell's cost, which the engine counts
 * as the spell is cast, D-183, D-206; CR 707.10: a copy of a spell was not cast and has none). The engine's `manaSpentAtLeast`, read from the spell that
 * caused the trigger. Not read: "or fewer" and "at most", a mana of a kind ("{R}{R}"), another spell ("this spell"), "it", the plural verb, zero.
 */
export const CONDITION_MANA_SPENT_OR_MORE = defineRule<IrCondition>({
  id: 'condition.mana-spent-or-more',
  family: 'condition',
  leading: [],
  cites: [
    'CR 601.2h (Casting Spells)',
    'CR 707.10 (Copying Objects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'five or more mana was spent to cast that spell',
    '5 or more mana was spent to cast that spell',
    'two or more mana was spent to cast that spell',
    'seven or more mana was spent to cast that spell',
  ],
  rejects: [
    'five or more mana was spent to cast that spell.',
    'five or fewer mana was spent to cast that spell',
    'at most five mana was spent to cast that spell',
    'at least five mana was spent to cast that spell',
    'five or more mana were spent to cast that spell',
    'five or more {R}{R} was spent to cast that spell',
    'five or more mana was spent to cast this spell',
    'five or more mana was spent to cast it',
    'five or more mana was spent',
    'five or more was spent to cast that spell',
    'zero or more mana was spent to cast that spell',
    'five mana was spent to cast that spell',
    'five or more mana was spent to cast that creature',
  ],
  parse: (ctx, pos) => {
    const lead = quantity(ctx, pos);
    if (!lead.ok) return lead;
    if (lead.value < 1) return fail(ctx, pos);
    const tail = sequence(
      pattern(/ or more mana was spent to cast /iu),
      spanned(pattern(/that spell(?![\p{L}\p{N}])/iu)),
    )(ctx, lead.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaSpentAtLeast', count: lead.value, ofTriggerSpell: true },
        span: { start: pos, end: tail.pos },
        rule: 'condition.mana-spent-or-more',
      },
      pos: tail.pos,
    };
  },
});

export const NIV_CONDITION_RULES = [CONDITION_MANA_SPENT_OR_MORE];
