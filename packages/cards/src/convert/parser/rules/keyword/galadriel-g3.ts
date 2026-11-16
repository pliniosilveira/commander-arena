/**
 * Keyword rules of group 3 of the Galadriel deck (issue 43): Buyback (Mystic Speculation, CR 702.27a).
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.buyback`: "Buyback {2}" (CR 702.27a: "You may pay an additional [cost] as you cast this spell" and "If the buyback cost was paid, put this spell into its owner's hand instead of
 * into that player's graveyard as it resolves"). The line is the cost and nothing else; the question while casting and the card's return to the hand are the engine's. A plain mana cost
 * without {X}. Not read: a cost of another kind after an em dash (the repository holds no real line of it), a second buyback on one line, other words on the line.
 */
export const KEYWORD_BUYBACK = defineRule<readonly IrKeyword[]>({
  id: 'keyword.buyback',
  family: 'keyword',
  leading: ['buyback'],
  cites: ['CR 702.27a (Buyback)', 'CR 601.2b (Casting Spells)', 'CR 118.8 (Costs)'],
  examples: ['Buyback {2}', 'Buyback {3}', 'Buyback {1}{U}', 'buyback {4}'],
  rejects: [
    'Buyback',
    'Buyback {X}',
    'Buyback {R/G}',
    'Buyback—Pay 2 life.',
    'Buyback {2}.',
    'Buyback {2}, haste',
    'Buyback {2} {1}',
    'Buyback {2}, buyback {1}',
    'Buybacks {2}',
    'Flying, buyback {2}',
    'Replicate {2}',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.buyback',
      map(sequence(literal('buyback '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name: 'buyback', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const GALADRIEL_G3_KEYWORD_RULES = [KEYWORD_BUYBACK];
