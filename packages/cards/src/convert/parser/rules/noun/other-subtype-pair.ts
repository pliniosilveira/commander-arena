/**
 * Noun rule of the day and night work (issue 345, Hound Tamer // Untamed Pup): "other Wolves and Werewolves you control" (CR 205.3m, 611.3a), the subject of "Other Wolves and
 * Werewolves you control have trample."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.other-subtype-pair`: "other Wolves and Werewolves you control": `noun.subtype-pair` with "other": two creature types said in the plural, joined by "and", one "you control"
 * for both, and every such permanent but the source (CR 611.3a). The engine's `anyOf` of the two types with the controller on the group and the noun's `other`. Not read: no "other", a
 * controller other than "you", no controller, one type, a third type, a type said in the singular (a type that is its own plural, "Treefolk", is both), a word that is no creature type, the same type twice.
 */
export const NOUN_OTHER_SUBTYPE_PAIR = defineRule<IrNoun>({
  id: 'noun.other-subtype-pair',
  family: 'noun',
  leading: ['other'],
  cites: ['CR 205.3m (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'other Wolves and Werewolves you control',
    'other Skeletons and Zombies you control',
    'other Elves and Wolves you control',
    // A type that is its own plural (Treefolk, Merfolk) reads in the plural slot.
    'other Plants and Treefolk you control',
  ],
  rejects: [
    'Wolves and Werewolves you control',
    'other Wolves and Werewolves',
    'other Wolves and Werewolves your opponents control',
    'other Wolves you control',
    'other Wolves, Werewolves, and Elves you control',
    'other Wolf and Werewolf you control',
    'other Wolves and Werewolf you control',
    'other Wolves and Bananas you control',
    'other Wolves and Wolves you control',
    'other Wolves or Werewolves you control',
    'another Wolves and Werewolves you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.other-subtype-pair',
    (ctx, pos) => {
      const r = sequence(
        literal('other '),
        SUBTYPE_WORD_NUMBERED,
        literal(' and '),
        SUBTYPE_WORD_NUMBERED,
        pattern(/ you control(?![\p{L}\p{N}'’])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, first, , second] = r.value;
      const kinds = [first, second];
      if (
        first.subtype === second.subtype ||
        kinds.some((w) => w.plural === false || !CREATURE_TYPES.has(w.subtype))
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
      other: true,
    }),
  ),
});
