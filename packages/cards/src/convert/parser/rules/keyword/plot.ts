/**
 * Keyword rule of Plot (CR 702.170, the Quick Draw deck, issue 121): "Plot {3}{U}".
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.plot`: "Plot {3}{U}" (CR 702.170a: a special action that works from the hand, in the owner's main phase with the stack empty: exile the card and pay the cost, and it becomes a
 * plotted card, which its owner may cast from exile without paying its mana cost in a later turn, CR 702.170d). The line is the cost and nothing else; the special action and the cast from
 * exile are the engine's. A plain mana cost without {X}. Not read: another kind of cost, a second plot on one line, other words on the line.
 */
export const KEYWORD_PLOT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.plot',
  family: 'keyword',
  leading: ['plot'],
  cites: ['CR 702.170a (Plot)', 'CR 116.2k (Special Actions)', 'CR 702.170d (Plot)'],
  examples: ['Plot {3}{U}', 'Plot {3}{R}', 'Plot {1}{B}', 'plot {2}'],
  rejects: [
    'Plot',
    'Plot {X}',
    'Plot {R/G}',
    'Plot—Pay 2 life.',
    'Plot {2}.',
    'Plot {2}, haste',
    'Plot {2} {1}',
    'Plot {2}, plot {1}',
    'Plots {2}',
    'Flying, plot {2}',
    'Buyback {2}',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.plot',
      map(sequence(literal('plot '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name: 'plot', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const PLOT_KEYWORD_RULES = [KEYWORD_PLOT];
