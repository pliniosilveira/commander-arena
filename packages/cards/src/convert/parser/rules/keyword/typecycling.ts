/**
 * `keyword.typecycling`: "Basic landcycling {1}", "Islandcycling {2}" and the other basic land
 * types (CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library
 * for a [type] card, reveal it, put it into your hand, then shuffle", an activated ability that
 * works only from the hand, CR 702.29f). The engine keeps it as one keyword with the filter of the
 * search and the cost without the discard (D-110), so the lowering only builds that keyword.
 */
import { choice, literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';
import { TYPECYCLINGS } from './vocabulary';

/** The words of the typecycling table, longest first: "basic landcycling" before any prefix. */
const TYPE_WORD = choice(...TYPECYCLINGS.map(([word]) => map(literal(`${word} `), () => word)));

/**
 * "Basic landcycling {1}", "Plainscycling {2}", "Islandcycling {1}", "Swampcycling {2}",
 * "Mountaincycling {2}", "Forestcycling {2}". The cost is a plain mana cost, as Cycling's is; the
 * type is one of the five basic land types or "basic land". A creature type ("Wizardcycling"),
 * "Landcycling" and a cost of anything else stay unread.
 */
export const KEYWORD_TYPECYCLING = defineRule<readonly IrKeyword[]>({
  id: 'keyword.typecycling',
  family: 'keyword',
  leading: TYPECYCLINGS.map(([word]) => word.split(' ')[0] ?? word),
  cites: ['CR 702.29e (Typecycling)', 'CR 702.29f (Typecycling)', 'CR 701.23 (Search)'],
  examples: [
    'Basic landcycling {1}',
    'Basic landcycling {2}',
    'Plainscycling {2}',
    'Islandcycling {1}',
    'Swampcycling {2}',
    'Mountaincycling {1}',
    'Forestcycling {2}',
    'basic landcycling {1}',
    'Islandcycling {1}{U}',
  ],
  rejects: [
    'Basic landcycling',
    'Basic landcycling {X}',
    'Basic landcycling {W/U}',
    'Basic landcycling {1}.',
    'Basic landcycling—Pay 2 life',
    'Plainscycling',
    'Islandcycling {2}, islandcycling {2}',
    'Islandcycling {2} and flying',
    'Landcycling {2}',
    'Wizardcycling {2}',
    'Snow-covered landcycling {2}',
    'Basic landwalk',
    'Cycling {2}',
  ],
  parse: map(
    node<{ word: string; cost: IrCost }, IrKeyword>(
      'keyword.typecycling',
      map(sequence(TYPE_WORD, family<IrCost>('cost', { only: ['cost.mana'] })), ([word, cost]) => ({
        word,
        cost,
      })),
      ({ word, cost }) => ({ kind: 'keyword', name: word, params: [], cost: [cost] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const TYPECYCLING_RULES = [KEYWORD_TYPECYCLING];
