/**
 * Noun rules of group 2 of the Gisa deck (issue 41, D-468): "Skeletons and Zombies you control" (CR 205.3m, 611.3a), the subject of "Skeletons and Zombies you control get +1/+1
 * and have menace."
 */
import { choice, fail, literal, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.subtype-pair`: "Skeletons and Zombies you control", "Assassins, Mercenaries, and Rogues you control": two or more different creature types said in the plural, joined by "and" (more
 * than two with commas and a last ", and"), and one "you control" for both (CR 205.3m: a creature type; CR
 * 611.3a: the group is whatever matches at any moment). The engine's `anyOf` of the two types with the controller on the group, as `noun.plain-permanents` reads "Zombies you
 * control" and `noun.subtype-union` reads "Skeletons you control and other Zombies you control". Not read: "other", a controller other than "you", no controller, one type, a list
 * without its Oxford comma ("A, B and C"), a type said in the singular, a word that is no creature type, the same type twice, a type of another kind of permanent.
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
    'Assassins, Mercenaries, and Rogues you control',
    'Skeletons, Zombies, Elves, and Wolves you control',
  ],
  rejects: [
    'Skeletons and Zombies',
    'Skeletons and Zombies your opponents control',
    'Skeletons you control',
    'Skeletons and other Zombies you control',
    'Skeletons and Zombies and Elves you control',
    'Skeletons, Zombies and Elves you control',
    'Skeletons, and Zombies you control',
    'Skeletons, Zombies, Elves you control',
    'Skeletons, Zombies, and Zombies you control',
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
      // "A and B you control", "A, B, and C you control" (Mari, the Killing Quill: "Assassins, Mercenaries, and Rogues you control"): two or more different creature types said in the
      // plural; two are joined by "and", more by commas and a last ", and".
      const first = SUBTYPE_WORD_NUMBERED(ctx, pos);
      if (!first.ok) return first;
      const kinds = [first.value];
      let at = first.pos;
      for (;;) {
        const sep = choice(literal(', and '), literal(' and '), literal(', '))(ctx, at);
        if (!sep.ok) return fail(ctx, pos);
        const word = SUBTYPE_WORD_NUMBERED(ctx, sep.pos);
        if (!word.ok) return fail(ctx, pos);
        kinds.push(word.value);
        at = word.pos;
        const last = sep.value !== ', ';
        // Two types: " and "; three or more: ", " between and ", and " before the last.
        if (
          last !==
          (sep.value === ', and ' ? kinds.length >= 3 : sep.value === ' and ' && kinds.length === 2)
        ) {
          return fail(ctx, pos);
        }
        if (last) break;
      }
      const end = pattern(/ you control(?![\p{L}\p{N}'’])/iu)(ctx, at);
      if (!end.ok) return end;
      // Different creature types, each said in the plural.
      if (
        new Set(kinds.map((w) => w.subtype)).size !== kinds.length ||
        kinds.some((w) => w.plural !== true || !CREATURE_TYPES.has(w.subtype))
      ) {
        return fail(ctx, pos);
      }
      const raw = ctx.text.slice(pos, end.pos);
      const base = toFilter('battlefield', { ...NO_PARTS, controller: 'you' }, raw);
      const anyOf = kinds.map((w): IrFilter => ({ subtypes: [w.subtype], raw: w.subtype }));
      return { ok: true, value: { ...base, anyOf }, pos: end.pos };
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
