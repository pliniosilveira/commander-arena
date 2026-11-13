/**
 * Static ability rules of the Hashaton deck program, group 6 (D-1171, provisional): "You and creatures you control have protection from the chosen card
 * type." (CR 702.16, 607.2d), the engine's player protection (`playerProtection`) and a granted keyword `protection` from `chosenCardType`.
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { subjectNoun } from './angels-words';

/**
 * `static.you-and-creatures-protection-chosen-type`: "You and creatures you control have protection from the chosen card type." (CR 702.16a: protection
 * from a card type applies to sources of that type; CR 702.16b, 702.16e: it stops targeting and damage, for a permanent or a player; CR 607.2d: "the chosen
 * card type" is the choice the permanent made as it entered, `replacement.as-enters-choose`). One statement of two subjects: the controller of the permanent
 * and the creatures they control, a group of the whole battlefield as it is at any moment (CR 611.3a). Not read: other protection qualities ("from red"), a
 * group other than the controller's own creatures ("Other creatures you control", "Creatures your opponents control"), a card type named instead of
 * chosen, a duration or a condition, and the controller alone.
 */
export const STATIC_YOU_AND_CREATURES_PROTECTION_CHOSEN_TYPE = defineRule<IrStatic>({
  id: 'static.you-and-creatures-protection-chosen-type',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 702.16a (Protection)',
    'CR 702.16b (Protection)',
    'CR 702.16e (Protection)',
    'CR 607.2d (Linked Abilities)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: ['You and creatures you control have protection from the chosen card type.'],
  rejects: [
    'You and creatures you control have protection from the chosen card type',
    'You have protection from the chosen card type.',
    'Creatures you control have protection from the chosen card type.',
    'You and other creatures you control have protection from the chosen card type.',
    'You and creatures your opponents control have protection from the chosen card type.',
    'You and creatures you control have protection from the chosen type.',
    'You and creatures you control have protection from the chosen color.',
    'You and creatures you control have protection from artifacts.',
    'You and creatures you control have protection from the chosen card type until end of turn.',
    'You and creatures you control have protection from the chosen card type as long as you control a Dragon.',
    'You and creatures you control have protection from the chosen card type and flying.',
    'You and creatures you control has protection from the chosen card type.',
  ],
  parse: (ctx, pos) => {
    const head = sequence(spanned(pattern(/you(?![\p{L}\p{N}])/iu)), literal(' and '))(ctx, pos);
    if (!head.ok) return head;
    const [you] = head.value;
    const group = quiet(family<IrNoun>('noun', { only: ['noun.plain-permanents'] }))(ctx, head.pos);
    if (!group.ok) return group;
    // "creatures you control": the controller's own group, not "other" ones.
    if (group.value.filter.controller !== 'you' || group.value.other) return fail(ctx, pos);
    const tail = sequence(literal(' have protection from the chosen card type'), literal('.'))(
      ctx,
      group.pos,
    );
    if (!tail.ok) return tail;
    const id = 'static.you-and-creatures-protection-chosen-type';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('you', 'you', you.span, id),
        effects: [{ kind: 'playerProtection', quality: 'chosenCardType' }],
        also: [
          {
            subject: group.value,
            effects: [{ kind: 'grantProtection', chosenCardType: true }],
          },
        ],
        span: { start: pos, end: tail.pos },
        rule: id,
      },
      pos: tail.pos,
    };
  },
});

export const HASHATON_G6_STATIC_RULES = [STATIC_YOU_AND_CREATURES_PROTECTION_CHOSEN_TYPE].map(
  quietly,
);
