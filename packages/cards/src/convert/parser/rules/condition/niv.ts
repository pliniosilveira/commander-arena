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

/**
 * `condition.mana-spent-less-than-mana-value`: "the amount of mana spent to cast it was less than its mana value" (Ancient Cellarspawn, CR 601.2h, 202.3, 603.4): the mana paid for the cost of the
 * spell that caused a cast trigger against that spell's mana value (an X counted as announced, CR 202.3e). The engine's `manaSpentLessThanManaValue`, read as the event happens and again as the
 * ability resolves; the lowering reads it in a trigger about other spells being cast only. Not read: "that spell", "this spell", "fewer", "at most", "no more than", "more than",
 * "equal to", the plural verb, another statistic ("its power"), "mana cost".
 */
export const CONDITION_MANA_SPENT_LESS_THAN_MANA_VALUE = defineRule<IrCondition>({
  id: 'condition.mana-spent-less-than-mana-value',
  family: 'condition',
  leading: ['the'],
  cites: [
    'CR 601.2h (Casting Spells)',
    'CR 202.3 (Mana Value)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: ['the amount of mana spent to cast it was less than its mana value'],
  rejects: [
    'the amount of mana spent to cast it was less than its mana value.',
    'the amount of mana spent to cast that spell was less than its mana value',
    'the amount of mana spent to cast it was less than that spell’s mana value',
    'the amount of mana spent to cast it was greater than its mana value',
    'the amount of mana spent to cast it was less than or equal to its mana value',
    'the amount of mana spent to cast it was less than its power',
    'the amount of mana spent to cast it was less than its mana cost',
    'the amount of mana spent to cast it were less than its mana value',
    'the mana spent to cast it was less than its mana value',
    'mana spent to cast it was less than its mana value',
  ],
  parse: (ctx, pos) => {
    const m = spanned(
      pattern(
        /the amount of mana spent to cast it was less than its mana value(?![\p{L}\p{N}'’])/iu,
      ),
    )(ctx, pos);
    if (!m.ok) return m;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaSpentLessThanManaValue' },
        span: { start: pos, end: m.pos },
        rule: 'condition.mana-spent-less-than-mana-value',
      },
      pos: m.pos,
    };
  },
});

export const NIV_CONDITION_RULES = [
  CONDITION_MANA_SPENT_OR_MORE,
  CONDITION_MANA_SPENT_LESS_THAN_MANA_VALUE,
];
