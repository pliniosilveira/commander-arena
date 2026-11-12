/**
 * Noun rule of the Niv-Mizzet deck, group B (D-295): "each of one or two targets" (CR 115.1, 601.2c: the targets of any kind are chosen as the spell is
 * cast, at least one and at most two; CR 115.3: the same target can't be chosen twice for one instance of the word "target"). The creature form,
 * "one or two target creatures", is part of `targetOf` (`noun.target-permanent`).
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';

const END = '(?![\\p{L}\\p{N}])';

/**
 * `noun.one-or-two-targets`: "each of one or two targets", the recipient of "~ deals 1 damage to each of one or two targets" (Prismari Charm). One slot of
 * any target (a creature, player, planeswalker or battle, CR 115.4) with one to two targets, each dealt the damage. "Other targets" (a slot that differs
 * from the slot before it), "target" in the singular and a number other than "one or two" are other phrases and stay unread.
 */
export const NOUN_ONE_OR_TWO_TARGETS = defineRule<IrNoun>({
  id: 'noun.one-or-two-targets',
  family: 'noun',
  leading: ['each'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 115.3 (Targets)',
    'CR 115.4 (Targets)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: ['each of one or two targets', 'Each of one or two targets'],
  rejects: [
    'each of one or two other targets',
    'each of one or two target',
    'each of one or three targets',
    'each of up to two targets',
    'each of two targets',
    'each of one or two targets you control',
    'each of one or two creatures',
    'one or two targets',
    'each of one or two',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`each of one or two targets${END}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: { anyTarget: true, raw: 'any target' },
        count: { kind: 'number', value: 2, span: r.value.span },
        minTargets: 1,
        upTo: false,
        plural: true,
        other: false,
        span: r.value.span,
        rule: 'noun.one-or-two-targets',
      },
      pos: r.pos,
    };
  },
});

export const ONE_OR_TWO_NOUN_RULES = [NOUN_ONE_OR_TWO_TARGETS].map(quietly);
