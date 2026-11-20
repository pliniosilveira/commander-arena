/**
 * Noun rule of the Tannuk deck (issue 347): "Treefolk and Forests you control" (CR 205.3m, 205.3i, 611.3a), the group of "Treefolk and Forests you control gain indestructible until
 * end of turn."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

const BASIC_LAND_TYPES: ReadonlySet<string> = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
]);

/**
 * `noun.creature-land-pair`: "Treefolk and Forests you control": a creature type and then a basic land type, each said in the plural, joined by "and", and one "you control" for both
 * (CR 205.3m: a creature type; CR 205.3i: a land type; CR 611.3a: the group is whatever matches at any moment). The engine's `anyOf` of the two subtypes with the controller on
 * the group, as `noun.subtype-pair` reads two creature types. Not read: "other", a controller other than "you", no controller, one type, a third type, a type said in the
 * singular, two creature types, two land types, a land type that is not basic, a type of another kind.
 */
export const NOUN_CREATURE_LAND_PAIR = defineRule<IrNoun>({
  id: 'noun.creature-land-pair',
  family: 'noun',
  leading: [],
  cites: ['CR 205.3m (Subtypes)', 'CR 205.3i (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'Treefolk and Forests you control',
    'Elves and Swamps you control',
    'Wolves and Mountains you control',
  ],
  rejects: [
    'Treefolk and Forests',
    'Treefolk and Forests your opponents control',
    'Forests you control',
    'Forests and Elves you control',
    'Treefolk and other Forests you control',
    'Treefolk, Elves, and Forests you control',
    'Treefolk and Forest you control',
    'Treefolk and Elves you control',
    'Forests and Islands you control',
    'Treefolk and Desert you control',
    'Treefolk and Treasures you control',
    'Treefolk or Forests you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.creature-land-pair',
    (ctx, pos) => {
      const r = sequence(
        SUBTYPE_WORD_NUMBERED,
        literal(' and '),
        SUBTYPE_WORD_NUMBERED,
        pattern(/ you control(?![\p{L}\p{N}'’])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [first, , second] = r.value;
      const isCreature = (w: { subtype: string }) =>
        CREATURE_TYPES.has(w.subtype) && !BASIC_LAND_TYPES.has(w.subtype);
      const isLand = (w: { subtype: string }) => BASIC_LAND_TYPES.has(w.subtype);
      const mixed = isCreature(first) && isLand(second);
      // Each type said in the plural (a type that is its own plural says nothing about the number).
      if (!mixed || first.plural === false || second.plural === false) return fail(ctx, pos);
      const raw = ctx.text.slice(pos, r.pos);
      const base = toFilter('battlefield', { ...NO_PARTS, controller: 'you' }, raw);
      const anyOf = [first, second].map(
        (w): IrFilter => ({ subtypes: [w.subtype], raw: w.subtype }),
      );
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

export const CREATURE_LAND_PAIR_NOUN_RULES = [NOUN_CREATURE_LAND_PAIR];
