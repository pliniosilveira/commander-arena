/**
 * Static statements of group C of the Grand Larceny deck (issue 119): "Plotting cards from your hand costs {2} less." (Doc Aurlock, Grizzled Genius; CR 702.170a, 118.7a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.plot-cost-reduction`: "Plotting cards from your hand costs {2} less." (CR 702.170a: plotting is the special action of exiling a card with plot from the hand for its plot
 * cost; CR 118.7a: a reduction takes generic mana off a cost). A static ability of a permanent that reduces the plot cost of the cards its controller plots: the engine's
 * `plotCostReduction`. Whole numbers of generic mana only. Not read: colored mana, "{X}", "{0}", "more", "to cast", a count after it, cards plotted from another zone or by another player.
 */
export const STATIC_PLOT_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.plot-cost-reduction',
  family: 'static',
  leading: ['plotting'],
  cites: ['CR 702.170a (Plot)', 'CR 118.7a (Costs)'],
  examples: [
    'Plotting cards from your hand costs {2} less.',
    'Plotting cards from your hand costs {1} less.',
  ],
  rejects: [
    'Plotting cards from your hand costs {2} less',
    'Plotting cards from your hand costs {X} less.',
    'Plotting cards from your hand costs {R} less.',
    'Plotting cards from your hand costs {0} less.',
    'Plotting cards from your hand costs {1}{R} less.',
    'Plotting cards from your hand costs {2} more.',
    'Plotting cards from your hand costs {2} less to cast.',
    'Plotting cards from your hand costs {2} less for each artifact you control.',
    'Plotting cards from your graveyard costs {2} less.',
    'Plotting cards costs {2} less.',
    'Plotting cards from an opponent’s hand costs {2} less.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.plot-cost-reduction';
    const r = sequence(
      literal('plotting cards from your hand costs '),
      pattern(/\{([1-9]\d*)\}/),
      literal(' less'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'plotCostReduction', amount: Number(r.value[1][1]) }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_C_STATIC_RULES = [STATIC_PLOT_COST_REDUCTION];
