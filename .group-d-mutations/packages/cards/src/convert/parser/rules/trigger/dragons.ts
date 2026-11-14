/**
 * Trigger rules of stage P34 (D-151, D-152): "Whenever ~ attacks for the first time each turn" (CR 508.1, 500.8: a creature may be declared as
 * an attacker again in an additional combat phase, and the ability triggers only the first time it was declared this turn).
 */
import { literal, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { permanentOrAttachedSubject } from './subjects';

/**
 * `trigger.attacks-first-time`: "~ attacks for the first time each turn", "a creature you control attacks for the first time each turn" (CR 508.1,
 * 500.8, 603.2). Tried before `trigger.attacks`, whose phrase is a prefix of this one; the event and its subject are those of `trigger.attacks`.
 */
export const TRIGGER_ATTACKS_FIRST_TIME = defineRule<IrTrigger>({
  id: 'trigger.attacks-first-time',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 500.8 (Extra Turns)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    '~ attacks for the first time each turn',
    'a creature you control attacks for the first time each turn',
    'equipped creature attacks for the first time each turn',
  ],
  rejects: [
    '~ attacks',
    '~ attacks for the first time',
    '~ attacks for the second time each turn',
    '~ attacks for the first time this turn',
    '~ attacks for the first time each combat',
    '~ attacks for the first time each turn or dies',
    '~ attacks you for the first time each turn',
    '~ blocks for the first time each turn',
  ],
  parse: (ctx, pos) => {
    const head = sequence(
      permanentOrAttachedSubject('trigger.attacks-first-time'),
      literal(' attacks for the first time each turn'),
    )(ctx, pos);
    if (!head.ok) return head;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attacks',
        subject: head.value[0],
        firstEachTurn: true,
        args: {},
        span: { start: pos, end: head.pos },
        rule: 'trigger.attacks-first-time',
      },
      pos: head.pos,
    };
  },
});

export const DRAGON_TRIGGER_RULES = [TRIGGER_ATTACKS_FIRST_TIME];
