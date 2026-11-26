/**
 * Noun rules of the Squirreled Away deck, group 4 (Garruk, Cursed Huntsman): "each Garruk you control" (CR 205.3j, 110.1).
 */
import { literal, map, optional, satisfy, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CONTROL_SUFFIX, NO_PARTS, toFilter } from './phrases';
import { PLANESWALKER_TYPES, SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.each-planeswalker-type`: "each Garruk you control" (CR 205.3j: a planeswalker type is a subtype of the permanents that have it): every permanent of that planeswalker type, of
 * the player the words after it name. The type stands alone, as it does where a card names the planeswalkers like itself; the normalizer leaves it as the type after "each" and other
 * words that make it a kind of permanent (`PLANESWALKER_TYPE_LEAD`), where the same word alone is the card itself. Not read: a plural, two types, "other", a type that is not a planeswalker
 * type, another word that makes it a kind ("target Jace", `noun.target-permanent`'s phrase).
 */
export const NOUN_EACH_PLANESWALKER_TYPE = defineRule<IrNoun>({
  id: 'noun.each-planeswalker-type',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 205.3j (Planeswalker Types)', 'CR 110.1 (Permanents)'],
  examples: ['each Garruk you control', 'each Jace', 'each Chandra an opponent controls'],
  rejects: [
    'each Garruks you control',
    'each Garruk Jace you control',
    'each other Garruk you control',
    'each Elf you control',
    'each garruk you control',
    'each Garruk planeswalker you control',
    'Garruk you control',
    'target Garruk you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.each-planeswalker-type',
    map(
      sequence(
        literal('each '),
        satisfy(
          SUBTYPE_WORD_NUMBERED,
          (word) => word.plural !== true && PLANESWALKER_TYPES.has(word.subtype),
        ),
        optional(CONTROL_SUFFIX, undefined),
      ),
      ([, word, controller]) => ({
        ...toFilter('battlefield', { ...NO_PARTS, controller }, ''),
        subtypes: [word.subtype],
      }),
    ),
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const SQUIRRELED_G4_NOUN_RULES = [NOUN_EACH_PLANESWALKER_TYPE];
