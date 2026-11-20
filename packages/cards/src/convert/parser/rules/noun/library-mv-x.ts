/**
 * `noun.library-card-mana-value-x`: "a creature card with mana value X or less" as what a search looks for (Finale of Devastation, CR 701.23, 202.3, 107.3a): one card of the library phrase
 * whose mana value is at most the X announced for the spell. Its own rule, read only where the search asks for it by id (`effect.search`), so the plain library noun is unchanged
 * ("a creature card with mana value 3 or less" is still not read). The lowering reads the flag as the engine's `manaValueAtMost` of `{ kind: 'x' }`.
 */
import { map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { libraryPhrase } from './library';
import { BOUNDARY } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

export const NOUN_LIBRARY_CARD_MANA_VALUE_X = defineRule<IrNoun>({
  id: 'noun.library-card-mana-value-x',
  family: 'noun',
  leading: ['a', 'an'],
  cites: ['CR 701.23a (Search)', 'CR 202.3 (Mana Value)', 'CR 107.3a (X)'],
  examples: [
    'a creature card with mana value X or less',
    'a card with mana value X or less',
    'a land card with mana value X or less',
    'an artifact card with mana value X or less',
  ],
  rejects: [
    'a creature card with mana value 3 or less',
    'a creature card with mana value X',
    'a creature card with mana value X or more',
    'creature cards with mana value X or less',
    'up to two creature cards with mana value X or less',
    'a creature card',
    'a basic land with mana value X or less',
  ],
  parse: node<Bare, IrNoun>(
    'noun.library-card-mana-value-x',
    map(
      sequence(
        pattern(/an? /iu),
        libraryPhrase(false),
        pattern(new RegExp(` with mana value X or less${BOUNDARY}`, 'u')),
      ),
      ([, filter]): Bare => ({
        kind: 'noun',
        det: 'a',
        filter: { ...filter, manaValueAtMostX: true },
        upTo: false,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});
