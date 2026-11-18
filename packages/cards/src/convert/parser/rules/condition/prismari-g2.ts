/**
 * Conditions of group 2 of the Prismari deck (issue 87, D-646 and later): "that spell's mana value is 5 or greater" (CR 202.3, 608.2h), the test of an "If ..., create three of those
 * tokens instead" sentence of a trigger about a spell that was cast. It reads the spell that caused the trigger, as it is on the stack or as it last was; the lowering reads it only in
 * such a trigger (`ctx.castTrigger`).
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule } from '../registry';

/**
 * `condition.spell-mana-value-or-more`: "that spell's mana value is 5 or greater" (CR 202.3: the total of the mana cost, with the X announced for a spell on the stack, CR 202.3e).
 * The engine's `objectMatches` of the `triggerSubject` with a `manaValue` comparison. Not read: "or less", "or fewer", "or more", "is 5", another object ("it", "that creature",
 * "that card"), zero, a variable number.
 */
export const CONDITION_SPELL_MANA_VALUE = defineRule<IrCondition>({
  id: 'condition.spell-mana-value-or-more',
  family: 'condition',
  leading: ['that'],
  cites: [
    'CR 202.3 (Mana Value)',
    'CR 202.3e (Mana Value)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    "that spell's mana value is 5 or greater",
    'that spell’s mana value is 5 or greater',
    "that spell's mana value is five or greater",
    "that spell's mana value is 3 or greater",
  ],
  rejects: [
    "that spell's mana value is 5 or less",
    "that spell's mana value is 5 or more",
    "that spell's mana value is 5",
    "that spell's mana value is 0 or greater",
    "that spell's mana value is X or greater",
    "that spell's mana value is 5 or greater.",
    "that spell's mana value is 5 or greater and",
    "that card's mana value is 5 or greater",
    'its mana value is 5 or greater',
    "that creature's mana value is 5 or greater",
    "this spell's mana value is 5 or greater",
    'that spells mana value is 5 or greater',
    "that spell's mana value is greater than 5",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/that spell['’]s mana value is /iu)(ctx, pos);
    if (!head.ok) return head;
    const n = quantity(ctx, head.pos);
    if (!n.ok) return n;
    if (n.value < 1) return fail(ctx, pos);
    const tail = pattern(/ or greater(?![\p{L}\p{N}])/iu)(ctx, n.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'triggerSpellManaValue', atLeast: n.value },
        span: { start: pos, end: tail.pos },
        rule: 'condition.spell-mana-value-or-more',
      },
      pos: tail.pos,
    };
  },
});

export const PRISMARI_G2_CONDITION_RULES = [CONDITION_SPELL_MANA_VALUE];
