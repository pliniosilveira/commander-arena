/**
 * Trigger rules of group 9 of the Hashaton deck (issue 31, D-391 provisional): "whenever a source deals damage to ~" (Rona, Tolarian Obliterator). The engine's `dealtDamage`,
 * which carries the controller of the source as `triggerPlayer`.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun, permanentOrAttachedSubject } from './subjects';

/**
 * `trigger.source-deals-damage`: "a source deals damage to ~", "a source deals combat damage to ~", "a source deals damage to a creature you control" (CR 120.3, 603.2, 603.2c: it
 * triggers once for each source that damages the permanent, in the moment the damage is dealt, so for the damage that kills it, and not for damage that is entirely prevented, CR 603.2g;
 * CR 113.7a: the controller of the source is read as it is, or as it last was when the source is gone). The same event as `trigger.dealt-damage` ("~ is dealt damage"), said with the
 * source first; the player the event is about is the controller of the source, which "that source's controller" names in the body (the `actor` of the trigger is its antecedent, and
 * the engine's `triggerPlayer` what it lowers to). Not read: a source of a kind ("a creature deals damage to ~", "a source you control deals damage to ~": the engine's trigger
 * has no filter on the source), damage to a player ("deals damage to you"), noncombat damage ("deals noncombat damage to ~", another event), "one or more sources", a plural source.
 */
export const TRIGGER_SOURCE_DEALS_DAMAGE = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.source-deals-damage',
    family: 'trigger',
    leading: ['a'],
    cites: [
      'CR 120.3 (Damage)',
      'CR 603.2 (Handling Triggered Abilities)',
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.2g (Handling Triggered Abilities)',
      'CR 113.7a (Abilities)',
    ],
    examples: [
      'a source deals damage to ~',
      'a source deals combat damage to ~',
      'a source deals damage to a creature you control',
      'a source deals damage to equipped creature',
    ],
    rejects: [
      'a source deals damage to you',
      'a source deals damage to target creature',
      'a source deals damage to an opponent',
      'a source deals noncombat damage to ~',
      'a source you control deals damage to ~',
      'a creature deals damage to ~',
      'a source deals damage',
      'a source deals damage to',
      'a source deal damage to ~',
      'sources deal damage to ~',
      'one or more sources deal damage to ~',
      'a source deals damage to ~ or you',
      'a source deals damage to ~ and',
      '~ is dealt damage',
    ],
    parse: (ctx, pos) => {
      const id = 'trigger.source-deals-damage';
      const head = pattern(/a source deals (combat )?damage to /iu)(ctx, pos);
      if (!head.ok) return head;
      const subject = permanentOrAttachedSubject(id)(ctx, head.pos);
      if (!subject.ok) return subject;
      const combat = head.value[1] !== undefined;
      // The controller of the source is the player the body can name ("that source's controller"): the antecedent of that pronoun.
      const actor = makeNoun(id, { start: pos, end: head.pos }, 'triggerActor', {
        raw: 'the controller of the source',
      });
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'dealtDamage',
          subject: subject.value,
          actor,
          ...(combat ? { combat: true as const } : {}),
          args: {},
          span: { start: pos, end: subject.pos },
          rule: id,
        },
        pos: subject.pos,
      };
    },
  }),
);

export const HASHATON_G9_TRIGGER_RULES = [TRIGGER_SOURCE_DEALS_DAMAGE];
