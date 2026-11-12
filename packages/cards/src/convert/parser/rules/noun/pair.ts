/**
 * Noun rules of the soulbond cards (D-286): the two creatures of a pair.
 */
import { map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `noun.paired-creatures`: "each of those creatures" (CR 702.95b: abilities of a creature that is paired may refer to the creature it is paired with), the subject of
 * "As long as ~ is paired with another creature, each of those creatures has ...": the permanent itself and the creature it is paired with. The engine's static subject
 * `pair`. The verb is singular, as the words of "each" are ("has", "gets"). Not read: "both creatures", "those creatures" and "each of those" alone (other nouns), "each of
 * those creatures you control", "each other creature", and the words as the target of an effect, where no permanent is paired.
 */
export const NOUN_PAIRED_CREATURES = defineRule<IrNoun>({
  id: 'noun.paired-creatures',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 702.95b (Soulbond)', 'CR 611.3a (Continuous Effects)'],
  examples: ['each of those creatures', 'Each of those creatures'],
  rejects: [
    'each of those',
    'each of those creatures.',
    'each of those creatures you control',
    'each of these creatures',
    'each of the creatures',
    'each of those creature',
    'both of those creatures',
    'both creatures',
    'those creatures',
    'each creature',
    'each of those other creatures',
  ],
  parse: node<string, IrNoun>(
    'noun.paired-creatures',
    map(pattern(/each of those creatures(?![\p{L}\p{N}])(?! you control)/iu), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'pair',
      filter: { raw },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const PAIR_NOUN_RULES = [NOUN_PAIRED_CREATURES];
