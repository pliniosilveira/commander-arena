/**
 * Trigger rule of group 4 of the Limit Break deck (issue 96): "one or more creatures you control become the target of an activated ability" (Professor Hojo).
 */
import { literal, map, pattern, quiet, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.targets-activated-batch`: "one or more creatures you control become the target of an activated ability" (CR 603.2, 603.2c, 602.2, 601.2c: the targets of an ability are chosen as it is
 * put on the stack; "one or more" is one trigger for the activated ability, however many of the group it targets). The engine's `becomesTarget` with `activatedOnly` and `batch`, the group
 * the filter of the creatures. Not read: one permanent ("becomes"), a spell or a triggered ability, "a spell or ability", a group of no controller or another one, "of an ability".
 */
export const TRIGGER_TARGETS_ACTIVATED_BATCH = defineRule<IrTrigger>({
  id: 'trigger.targets-activated-batch',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: [
    'one or more creatures you control become the target of an activated ability',
    'one or more Soldiers you control become the target of an activated ability',
  ],
  rejects: [
    'one or more creatures you control become the target of a spell',
    'one or more creatures you control become the target of an ability',
    'one or more creatures you control become the target of a spell or ability',
    'one or more creatures you control become the target of an activated or triggered ability',
    'one or more creatures you control becomes the target of an activated ability',
    'one or more creatures become the target of an activated ability',
    'one or more creatures an opponent controls become the target of an activated ability',
    'one or more creatures you control become the target of an activated ability an opponent controls',
    'a creature you control becomes the target of an activated ability',
    'one or more creatures you control become the target of an activated ability and',
  ],
  parse: (ctx, pos) => {
    // Quiet: the other "one or more ..." triggers keep stopping where they always did.
    const r = quiet(
      sequence(
        literal('one or more '),
        spanned(
          satisfy(
            map(permanentPhrase(true, 'all'), withoutZone),
            (filter) => filter.controller === 'you',
          ),
        ),
        pattern(
          new RegExp(
            ` become the target of an activated ability${NOT_IN_WORD}(?! (?:and|or)\\b)`,
            'iu',
          ),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, group] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'becomesTarget',
        subject: {
          ...makeNoun('trigger.targets-activated-batch', group.span, 'a', group.value),
          plural: true,
        },
        activatedOnly: true,
        batch: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.targets-activated-batch',
      },
      pos: r.pos,
    };
  },
});

export const LIMIT_BREAK_G4_TRIGGER_RULES = [TRIGGER_TARGETS_ACTIVATED_BATCH];
