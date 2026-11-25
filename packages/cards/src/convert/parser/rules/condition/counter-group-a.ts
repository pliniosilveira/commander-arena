/**
 * Conditions of the Final Fantasy X counter group (Wakka, Devoted Guardian; Shelinda, Yevon Acolyte): "a counter was put on ~ this turn" and "its power is less than ~'s power".
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

const END = "(?![\\p{L}\\p{N}'’])";

/**
 * `condition.counter-was-put-on-self-this-turn`: "a counter was put on ~ this turn", "a +1/+1 counter was put on ~ this turn" (CR 122.6, 603.4: a counter put on the permanent with the
 * ability this turn by any player, or by none, read from what happened this turn). The kind of counter is the one the text names, any when it says only "a counter". Not read: "one or
 * more", "counters", another permanent than `~`, "it", "you put", the present tense, another span of time ("last turn"), no "this turn".
 */
export const CONDITION_COUNTER_PUT_ON_SELF_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.counter-was-put-on-self-this-turn',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 122.6 (Counters)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'a counter was put on ~ this turn',
    'a +1/+1 counter was put on ~ this turn',
    'a charge counter was put on ~ this turn',
  ],
  rejects: [
    'a counter was put on ~',
    'a counter was put on it this turn',
    'a counter was put on a creature this turn',
    'a counter was put on target creature this turn',
    'one or more counters were put on ~ this turn',
    'a counter is put on ~ this turn',
    'a counter was put on ~ last turn',
    'a counters was put on ~ this turn',
    'a counter was put on ~ this turn and',
    'a counter was put on ~ this turn or',
    'you put a counter on ~ this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `an? (?:([+-]\\d+\\/[+-]\\d+|[a-z]+) )?counter was put on ~ this turn${END}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const kind = r.value.value[1]?.toLowerCase();
    // "a counter" read as the kind "counter" when the optional kind swallows it: the word "counter" is no kind.
    if (kind === 'counter') return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'counterPutOnSelf', ...(kind === undefined ? {} : { counter: kind }) },
        span: r.value.span,
        rule: 'condition.counter-was-put-on-self-this-turn',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.its-power-less-than-self`: "its power is less than ~'s power" (CR 208.1, 113.7a, 608.2c: the power the permanent the trigger is about has now, or had as it left the
 * battlefield, against the power of the permanent with the ability, read as the instruction comes up). "Its" is a pronoun the lowering reads of the permanent the trigger is about.
 * The engine's `subjectPowerLessThanThis`. Not read: another comparison ("at most", "greater than", "equal to"), toughness, another permanent than `~`, "that creature's power", the past
 * tense, a missing "power" at the end.
 */
export const CONDITION_ITS_POWER_LESS_THAN_SELF = defineRule<IrCondition>({
  id: 'condition.its-power-less-than-self',
  family: 'condition',
  leading: ['its'],
  cites: [
    'CR 208.1 (Power/Toughness)',
    'CR 113.7a (Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ["its power is less than ~'s power", 'its power is less than ~’s power'],
  rejects: [
    "its power is less than ~'s toughness",
    "its toughness is less than ~'s toughness",
    "its power is less than or equal to ~'s power",
    "its power is greater than ~'s power",
    "its power was less than ~'s power",
    "its power is less than ~'s",
    'its power is less than ~ power',
    "that creature's power is less than ~'s power",
    "its power is less than another creature's power",
    "its power is less than ~'s power and",
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`its power is less than ~['’]s power${END}`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'subjectPowerLessThanSelf' },
        span: r.value.span,
        rule: 'condition.its-power-less-than-self',
      },
      pos: r.pos,
    };
  },
});

export const COUNTER_GROUP_A_CONDITION_RULES = [
  CONDITION_COUNTER_PUT_ON_SELF_THIS_TURN,
  CONDITION_ITS_POWER_LESS_THAN_SELF,
];
