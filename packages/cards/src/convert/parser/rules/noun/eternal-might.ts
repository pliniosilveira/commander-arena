/**
 * Noun rules of the Eternal Might deck (issue 104): "creatures you control that are Zombies and/or tokens" (CR 205.3m, 111.1, 611.3a), the subject of
 * "Creatures you control that are Zombies and/or tokens get +1/+1 and have flying."
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.creatures-subtype-and-or-tokens`: "creatures you control that are Zombies and/or tokens": the creatures you control that are of a creature type, tokens, or
 * both (CR 205.3m: a creature type; CR 111.1: a token is a permanent that is not represented by a card; CR 611.3a: the group is whatever matches at any moment). The
 * engine's `anyOf` of the creature type and `token`, with the card type and the controller on the group, as `noun.subtype-pair` reads two types. A creature that is
 * both matches once. Not read: "other", a controller other than "you", no controller, a type said in the singular, a word that is no creature type, "and" or "or"
 * for "and/or", "nontoken", a card type other than creatures, more than one creature type.
 */
export const NOUN_CREATURES_SUBTYPE_AND_OR_TOKENS = defineRule<IrNoun>({
  id: 'noun.creatures-subtype-and-or-tokens',
  family: 'noun',
  leading: [],
  cites: ['CR 205.3m (Subtypes)', 'CR 111.1 (Tokens)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'Creatures you control that are Zombies and/or tokens',
    'Creatures you control that are Elves and/or tokens',
    'creatures you control that are Soldiers and/or tokens',
  ],
  rejects: [
    'Creatures you control that are Zombies',
    'Creatures you control that are Zombies or tokens',
    'Creatures you control that are Zombies and tokens',
    'Creatures you control that are tokens and/or Zombies',
    'Creatures you control that are Zombie and/or tokens',
    'Creatures you control that are Bananas and/or tokens',
    'Creatures you control that are Treasures and/or tokens',
    'Creatures that are Zombies and/or tokens',
    'Creatures your opponents control that are Zombies and/or tokens',
    'Other creatures you control that are Zombies and/or tokens',
    'Creatures you control that are Zombies and/or token',
    'Creatures you control that are Zombies and Elves and/or tokens',
    'Artifacts you control that are Zombies and/or tokens',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.creatures-subtype-and-or-tokens',
    (ctx, pos) => {
      const r = sequence(
        pattern(/creatures you control that are /iu),
        SUBTYPE_WORD_NUMBERED,
        pattern(/ and\/or tokens(?![\p{L}\p{N}'’])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, kind] = r.value;
      if (kind.plural !== true || !CREATURE_TYPES.has(kind.subtype)) return fail(ctx, pos);
      const raw = ctx.text.slice(pos, r.pos);
      const base = toFilter(
        'battlefield',
        { ...NO_PARTS, types: ['creature'], controller: 'you' },
        raw,
      );
      const anyOf: IrFilter[] = [
        { subtypes: [kind.subtype], raw: kind.subtype },
        { token: true, raw: 'tokens' },
      ];
      return { ok: true, value: { ...base, anyOf }, pos: r.pos };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const ETERNAL_MIGHT_NOUN_RULES = [NOUN_CREATURES_SUBTYPE_AND_OR_TOKENS];
