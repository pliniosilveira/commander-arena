/**
 * Noun words of group 3 of the Danitha deck (issue 26, D-426): the attachments of a permanent, in a count ("for each Aura attached to it", "for each Aura you
 * control that's attached to a creature") and in a group ("all creatures that aren't enchanted"). CR 303.4: an Aura is attached to the permanent it enchants, and "enchanted" is
 * said of a permanent with an Aura attached to it; CR 301.5: an Equipment is attached to the creature it equips; CR 701.3: attaching.
 */
import { choice, literal, map, optional, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, PLURAL_TYPE_UNION, permanentPhrase } from './phrases';

/** What an attachment suffix says: the permanent the counted objects are attached to. */
export type AttachedToWhat = NonNullable<IrFilter['attachedTo']>;

/**
 * " attached to it" and " that's attached to a creature", after the permanent a count names (D-426): "for each Aura attached to it" (the permanent the statement is about:
 * `it`), "for each Aura you control that's attached to a creature" (a creature, any: `type`). Nothing else is read: "attached to target creature", "attached to enchanted
 * creature" and "attached to a land" are other statements.
 */
export const ATTACHMENT_SUFFIX: Parser<AttachedToWhat> = choice(
  map(
    pattern(new RegExp(` attached to it${BOUNDARY}`, 'iu')),
    (): AttachedToWhat => ({ kind: 'it' }),
  ),
  map(
    pattern(new RegExp(` that['’]s attached to a creature${BOUNDARY}`, 'iu')),
    (): AttachedToWhat => ({ kind: 'type', types: ['creature'] }),
  ),
);

/** " that aren't enchanted" (the permanent has no Aura attached to it, CR 303.4) and " that are enchanted". */
const ENCHANTED_SUFFIX: Parser<boolean> = map(
  pattern(new RegExp(` that (aren['’]t|are) enchanted${BOUNDARY}`, 'iu')),
  (m) => (m[1] ?? '').toLowerCase() === 'are',
);

/**
 * `noun.all-enchanted`: "all creatures that aren't enchanted", "all creatures you control that aren't enchanted", "all creatures that are enchanted" (CR 303.4: a permanent
 * is enchanted while an Aura is attached to it, whoever controls the Aura or the permanent). The permanents that match at the moment the effect resolves (CR 611.2c, 608.2c);
 * an Equipment attached is no Aura. The engine's `ObjectFilter.enchanted`. Not read: the singular ("each creature that isn't enchanted"), "enchanted creatures" (a group the
 * words do not say), "that aren't equipped", "that aren't enchanted or tapped", and a controller after the suffix.
 */
export const NOUN_ALL_ENCHANTED = defineRule<IrNoun>({
  id: 'noun.all-enchanted',
  family: 'noun',
  leading: ['all'],
  cites: ['CR 303.4 (Auras)', 'CR 611.2c (Continuous Effects)'],
  examples: [
    "all creatures that aren't enchanted",
    'all creatures that aren’t enchanted',
    "all creatures you control that aren't enchanted",
    'all creatures that are enchanted',
    "all nonland permanents that aren't enchanted",
    "all other creatures that aren't enchanted",
  ],
  rejects: [
    "all creatures that aren't enchanted or tapped",
    "all creatures that aren't equipped",
    "all creatures that aren't",
    "all creatures that aren't enchanted you control",
    "all creature that aren't enchanted",
    "each creature that isn't enchanted",
    'all enchanted creatures',
    'all creatures that are enchanted creatures',
    "all creatures that aren't enchanted by you",
    "all that aren't enchanted",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      optional(
        map(literal('other '), () => true),
        false,
      ),
      choice(PLURAL_TYPE_UNION, permanentPhrase(true, 'all')),
      ENCHANTED_SUFFIX,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, other, found, enchanted] = r.value;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...found, enchanted, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other,
      span: { start: pos, end: r.pos },
      rule: 'noun.all-enchanted',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const DANITHA_G3_NOUN_RULES = [NOUN_ALL_ENCHANTED];
