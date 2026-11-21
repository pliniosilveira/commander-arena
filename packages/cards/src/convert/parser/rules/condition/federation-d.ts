/**
 * Condition rules of group D of the Federation Fleet deck: "if it has greater power than ~" (Ensign Harry Kim, Operations) and "if you put two or more +1/+1 counters on creatures this
 * way" (Guinan, Ancient Advisor). What the engine can run is the lowering's business (`lower/conditions.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule } from '../registry';

const END = "(?![\\p{L}\\p{N}'’])";

/**
 * `condition.it-has-greater-power`: "it has greater power than ~" (CR 208.1: the power of the creature the trigger is about, as the ability triggers and as it resolves, CR 603.4: an
 * intervening "if"). The engine's `subjectGreaterPt` that compares the power alone. "It" is the creature whose event caused the trigger and "~" the permanent with the ability. Not read: the
 * toughness, "or equal", another comparison ("less", "at least"), another permanent than this one, "that creature", the past tense, a number.
 */
export const CONDITION_IT_HAS_GREATER_POWER = defineRule<IrCondition>({
  id: 'condition.it-has-greater-power',
  family: 'condition',
  leading: ['it'],
  cites: [
    'CR 208.1 (Power and Toughness)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 702.100a (Evolve)',
  ],
  examples: ['it has greater power than ~', 'It has greater power than ~'],
  rejects: [
    'it has greater power',
    'it has greater toughness than ~',
    'it has greater power than or equal to ~',
    'it has greater power than that creature',
    'it has greater power than target creature',
    'it has greater power than 3',
    'it has less power than ~',
    'it had greater power than ~',
    'that creature has greater power than ~',
    'it has greater power than ~ and',
    'they have greater power than ~',
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`it has greater power than ~${END}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'subjectGreaterPower' },
        span: { start: pos, end: r.pos },
        rule: 'condition.it-has-greater-power',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.put-counters-this-way`: "you put two or more +1/+1 counters on creatures this way" (CR 122.6: counters put on objects, 608.2c: what the instruction before it did). The engine's
 * `thisWayAtLeast` of `countersPut`. Only after an instruction of the same text that put counters of that kind on creatures, which the lowering checks. Not read: "one or more" with no number
 * above one is read the same way (a number of one or more), a kind of counter with no name, "on permanents", "on target creature", the past tense, another player, "that way".
 */
export const CONDITION_PUT_COUNTERS_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.put-counters-this-way',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 122.6 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'you put two or more +1/+1 counters on creatures this way',
    'You put two or more +1/+1 counters on creatures this way',
    'you put three or more -1/-1 counters on creatures this way',
    'you put two or more charge counters on creatures this way',
  ],
  rejects: [
    'you put two +1/+1 counters on creatures this way',
    'you put two or more counters on creatures this way',
    'you put two or more +1/+1 counters on permanents this way',
    'you put two or more +1/+1 counters on target creature this way',
    'you put two or more +1/+1 counters on creatures',
    'you put two or more +1/+1 counters on creatures this turn',
    'you put zero or more +1/+1 counters on creatures this way',
    'you put two or more +1/+1 counters on creatures this way and',
    'an opponent puts two or more +1/+1 counters on creatures this way',
    'you put two or fewer +1/+1 counters on creatures this way',
    'you put two or more +1/+1 counters on a creature this way',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/you put /iu)(ctx, pos);
    if (!head.ok) return head;
    const n = quantity(ctx, head.pos);
    if (!n.ok) return n;
    const rest = pattern(
      new RegExp(
        ` or more ([+-]\\d+\\/[+-]\\d+|first strike|double strike|[a-z]+) counters on creatures this way${END}`,
        'iu',
      ),
    )(ctx, n.pos);
    if (!rest.ok) return rest;
    if (n.value < 1) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'putCountersThisWay',
          counter: (rest.value[1] ?? '').toLowerCase(),
          atLeast: n.value,
        },
        span: { start: pos, end: rest.pos },
        rule: 'condition.put-counters-this-way',
      },
      pos: rest.pos,
    };
  },
});

export const FEDERATION_D_CONDITION_RULES = [
  CONDITION_IT_HAS_GREATER_POWER,
  CONDITION_PUT_COUNTERS_THIS_WAY,
];
