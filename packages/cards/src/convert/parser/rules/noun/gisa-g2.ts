/**
 * Noun rules of group 2 of the Gisa deck (issue 41, D-1414): "Skeletons and Zombies you control" (CR 205.3m, 611.3a), the subject of "Skeletons and Zombies you control get +1/+1
 * and have menace."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.subtype-pair`: "Skeletons and Zombies you control": two creature types said in the plural, joined by "and", and one "you control" for both (CR 205.3m: a creature type; CR
 * 611.3a: the group is whatever matches at any moment). The engine's `anyOf` of the two types with the controller on the group, as `noun.plain-permanents` reads "Zombies you
 * control" and `noun.subtype-union` reads "Skeletons you control and other Zombies you control". Not read: "other", a controller other than "you", no controller, one type, three
 * types, a type said in the singular, a word that is no creature type, the same type twice, a type of another kind of permanent.
 */
export const NOUN_SUBTYPE_PAIR = defineRule<IrNoun>({
  id: 'noun.subtype-pair',
  family: 'noun',
  leading: [],
  cites: ['CR 205.3m (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'Skeletons and Zombies you control',
    'Zombies and Skeletons you control',
    'Elves and Wolves you control',
  ],
  rejects: [
    'Skeletons and Zombies',
    'Skeletons and Zombies your opponents control',
    'Skeletons you control',
    'Skeletons and other Zombies you control',
    'Skeletons, Zombies, and Elves you control',
    'Skeletons and Zombies and Elves you control',
    'Skeleton and Zombie you control',
    'Skeletons and Zombie you control',
    'Skeletons and Bananas you control',
    'Zombies and Zombies you control',
    'Skeletons or Zombies you control',
    'Treasures and Zombies you control',
    'Target Skeletons and Zombies you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.subtype-pair',
    (ctx, pos) => {
      const r = sequence(
        SUBTYPE_WORD_NUMBERED,
        literal(' and '),
        SUBTYPE_WORD_NUMBERED,
        pattern(/ you control(?![\p{L}\p{N}'’])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [first, , second] = r.value;
      const kinds = [first, second];
      // Two different creature types, each said in the plural.
      if (
        first.subtype === second.subtype ||
        kinds.some((w) => w.plural !== true || !CREATURE_TYPES.has(w.subtype))
      ) {
        return fail(ctx, pos);
      }
      const raw = ctx.text.slice(pos, r.pos);
      const base = toFilter('battlefield', { ...NO_PARTS, controller: 'you' }, raw);
      const anyOf = kinds.map((w): IrFilter => ({ subtypes: [w.subtype], raw: w.subtype }));
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

export const GISA_G2_NOUN_RULES = [NOUN_SUBTYPE_PAIR];
