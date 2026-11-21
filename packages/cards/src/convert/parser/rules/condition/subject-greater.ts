/**
 * Condition of Selvala, Heart of the Wilds: "its power is greater than each other creature's power", of the permanent whose event caused the trigger.
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.its-stat-greater-than-each-other`: "its power is greater than each other creature's power" (CR 603.10a, 113.7a, 208.1, 608.2c: the power the creature the trigger is about has now,
 * or had as it left the battlefield, against every other creature's, whoever controls it, read as the instruction comes up). "Its" is a pronoun the lowering reads of the permanent the trigger
 * is about. The engine's `subjectGreaterThanEach`. Not read: another comparison ("at least", "equal to"), "each creature you control", "each other creature's toughness" for the power,
 * a kind besides creature, the past tense ("was").
 */
export const CONDITION_ITS_STAT_GREATER_THAN_EACH_OTHER = defineRule<IrCondition>({
  id: 'condition.its-stat-greater-than-each-other',
  family: 'condition',
  leading: ['its'],
  cites: [
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 113.7a (Abilities)',
    'CR 208.1 (Power/Toughness)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "its power is greater than each other creature's power",
    'its power is greater than each other creature’s power',
    "its toughness is greater than each other creature's toughness",
  ],
  rejects: [
    "its power is greater than each other creature's toughness",
    "its power is greater than each creature's power",
    "its power is greater than or equal to each other creature's power",
    "its power is greater than each other creature you control's power",
    "its power was greater than each other creature's power",
    "its power is greater than each other creature's",
    "its power is greater than each other creatures' power",
    "that creature's power is greater than each other creature's power",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /its (power|toughness) is greater than each other creature['’]s (power|toughness)(?![\p{L}\p{N}'’])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const stat = (r.value.value[1] ?? '').toLowerCase();
    if (stat !== (r.value.value[2] ?? '').toLowerCase()) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'subjectGreaterThanEach',
          stat: stat === 'power' ? 'power' : 'toughness',
          types: ['creature'],
        },
        span: r.value.span,
        rule: 'condition.its-stat-greater-than-each-other',
      },
      pos: r.pos,
    };
  },
});

export const SUBJECT_GREATER_CONDITION_RULES = [CONDITION_ITS_STAT_GREATER_THAN_EACH_OTHER];
