/**
 * Trigger rules of stage P32 (D-145, D-147): "Whenever ~ attacks while you don't control another Dinosaur" (CR 603.2: the words after
 * "while" say when the event must happen, which the ability reads once as it happens; an intervening "if" is read again as the ability
 * resolves, CR 603.4, and is a different thing).
 */
import { fail, literal, sequence } from '../../combinators';
import type { IrCondition, IrTrigger } from '../../ir/types';
import { defineRule, family } from '../registry';
import { permanentOrAttachedSubject } from './subjects';

/** The tests a trigger may be said "while" of: the counts of permanents, a commander, the life total. */
const WHILE_CONDITIONS = [
  'condition.control-a',
  'condition.dont-control-a',
  'condition.control-at-least',
  'condition.control-none',
  'condition.control-commander',
  'condition.control-your-commander',
  'condition.life-total',
] as const;

/**
 * `trigger.attacks-while`: "~ attacks while you don't control another Dinosaur", "a creature you control attacks while you control a
 * commander" (CR 603.2). Tried before `trigger.attacks`, whose phrase is a prefix of this one; the event and its subject are those of
 * `trigger.attacks`, the condition the engine's `triggerCondition`.
 */
export const TRIGGER_ATTACKS_WHILE = defineRule<IrTrigger>({
  id: 'trigger.attacks-while',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 508.1 (Declare Attackers Step)'],
  examples: [
    "~ attacks while you don't control another Dinosaur",
    '~ attacks while you control a commander',
    'a creature you control attacks while you control a Dragon',
    '~ attacks while you have 30 or more life',
  ],
  rejects: [
    '~ attacks',
    '~ attacks while',
    '~ attacks while you control',
    '~ attacks while it is raining',
    '~ attacks while you control a Dragon or dies',
    "~ attacks you while you don't control another Dinosaur",
    '~ blocks while you control a Dragon',
  ],
  parse: (ctx, pos) => {
    const head = sequence(
      permanentOrAttachedSubject('trigger.attacks-while'),
      literal(' attacks while '),
    )(ctx, pos);
    if (!head.ok) return head;
    const test = family<IrCondition>('condition', { only: WHILE_CONDITIONS })(ctx, head.pos);
    if (!test.ok) return fail(ctx, head.pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attacks',
        subject: head.value[0],
        whileCondition: test.value,
        args: {},
        span: { start: pos, end: test.pos },
        rule: 'trigger.attacks-while',
      },
      pos: test.pos,
    };
  },
});

export const DINOSAUR_TRIGGER_RULES = [TRIGGER_ATTACKS_WHILE];
