/**
 * `keyword.typecycling`: "Basic landcycling {1}", "Islandcycling {2}" and the other basic land
 * types (CR 702.29e: "[Type]cycling [cost]" means "[Cost], Discard this card: Search your library
 * for a [type] card, reveal it, put it into your hand, then shuffle", an activated ability that
 * works only from the hand, CR 702.29f). The engine keeps it as one keyword with the filter of the
 * search and the cost without the discard (D-110), so the lowering only builds that keyword.
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule, family, node } from '../registry';
import { TYPECYCLINGS } from './vocabulary';

/** The words of the typecycling table, longest first: "basic landcycling" before any prefix. */
const TYPE_WORD = choice(...TYPECYCLINGS.map(([word]) => map(literal(`${word} `), () => word)));

/**
 * "Basic landcycling {1}", "Plainscycling {2}", "Islandcycling {1}", "Swampcycling {2}",
 * "Mountaincycling {2}", "Forestcycling {2}". The cost is a plain mana cost, as Cycling's is; the
 * type is one of the five basic land types or "basic land", or a creature type of the table
 * ("Wizardcycling {2}", "Halflingcycling {4}", Galadriel deck group 2, D-538: CR 702.29e takes any
 * card type or subtype). "Landcycling", a word that is no type and a cost of anything else stay unread.
 */
export const KEYWORD_TYPECYCLING = defineRule<readonly IrKeyword[]>({
  id: 'keyword.typecycling',
  family: 'keyword',
  // A creature type is any of ~300 words: no leading list (the rule is tried at every keyword position).
  leading: [],
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
    'Wizardcycling {2}',
    'Halflingcycling {4}',
    'Slivercycling {3}',
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
    'Wizzardcycling {2}',
    'Halflingcycling',
    'Halflingcycling {X}',
    'Halflingcycling—Pay 2 life',
    'Halflingcycling {4}.',
    'halflingcycling {4}',
    'Snow-covered landcycling {2}',
    'Basic landwalk',
    'Cycling {2}',
  ],
  parse: map(
    node<{ word: string; quality?: string; cost: IrCost }, IrKeyword>(
      'keyword.typecycling',
      choice(
        map(
          sequence(TYPE_WORD, family<IrCost>('cost', { only: ['cost.mana'] })),
          ([word, cost]) => ({ word, cost }),
        ),
        (ctx, pos) => {
          const r = sequence(
            pattern(/[A-Z][a-z]+(?=cycling \{)/u),
            literal('cycling '),
            family<IrCost>('cost', { only: ['cost.mana'] }),
          )(ctx, pos);
          if (!r.ok) return r;
          const [type, , cost] = r.value;
          const word = type[0];
          if (word === undefined || !CREATURE_TYPES.has(word)) return fail(ctx, pos);
          return {
            ok: true,
            value: { word: `${word.toLowerCase()}cycling`, quality: word, cost },
            pos: r.pos,
          };
        },
      ),
      ({ word, quality, cost }) => ({
        kind: 'keyword',
        name: word,
        params: [],
        cost: [cost],
        ...(quality === undefined ? {} : { quality }),
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const TYPECYCLING_RULES = [KEYWORD_TYPECYCLING];
