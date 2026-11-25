/**
 * Static statements of group C of the Grand Larceny deck (issue 119): "Plotting cards from your hand costs {2} less." (Doc Aurlock, Grizzled Genius; CR 702.170a, 118.7a) and "You may pay
 * {1}{B} rather than pay this spell's mana cost." (Baleful Mastery; CR 118.9).
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

/**
 * `static.pay-mana-alt-cost`: "You may pay {1}{B} rather than pay ~'s mana cost." (Baleful Mastery; CR 118.9: an alternative cost, chosen as the spell is cast, CR 601.2b, and
 * paid with the other costs, CR 601.2f). The engine's alternative cost `payMana`. Plain mana only: generic numbers and the five colors and {C}. Not read: {X}, hybrid or Phyrexian
 * mana, a cost with life or another part ("pay {B} and 4 life"), "instead of paying", a condition before or after it, "its mana cost", a number the text does not give.
 */
export const STATIC_PAY_MANA_ALT_COST = defineRule<IrStatic>({
  id: 'static.pay-mana-alt-cost',
  family: 'static',
  leading: ['you'],
  cites: ['CR 118.9 (Costs)', 'CR 601.2b (Casting Spells)', 'CR 601.2f (Casting Spells)'],
  examples: [
    "You may pay {1}{B} rather than pay ~'s mana cost.",
    "You may pay {U} rather than pay ~'s mana cost.",
    "You may pay {2}{W}{W} rather than pay ~'s mana cost.",
  ],
  rejects: [
    "You may pay {1}{B} rather than pay ~'s mana cost",
    "You may pay {X}{B} rather than pay ~'s mana cost.",
    "You may pay {B/G} rather than pay ~'s mana cost.",
    "You may pay {0} rather than pay ~'s mana cost.",
    "You may pay {B} and 4 life rather than pay ~'s mana cost.",
    "You may pay {1}{B} instead of paying ~'s mana cost.",
    'You may pay {1}{B} rather than pay its mana cost.',
    "You may pay 4 life rather than pay ~'s mana cost.",
    "If you control a Swamp, you may pay {1}{B} rather than pay ~'s mana cost.",
    "You may pay {1}{B} rather than pay ~'s mana cost and draw a card.",
    "You may pay {1}{B}rather than pay ~'s mana cost.",
    "You may pay 1B rather than pay ~'s mana cost.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.pay-mana-alt-cost';
    const r = sequence(
      literal('you may pay '),
      pattern(/(?:\{(?:[1-9]\d*|[WUBRGC])\})+(?= rather than pay )/u),
      literal(" rather than pay ~'s mana cost"),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const symbols = [...r.value[1][0].matchAll(/\{([^}]+)\}/gu)].map((m) => m[1] ?? '');
    const selfAt = ctx.text.indexOf('~', pos);
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: selfAt, end: selfAt + 1 },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'manaAlternative', cost: symbols }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_C_STATIC_RULES = [STATIC_PLOT_COST_REDUCTION, STATIC_PAY_MANA_ALT_COST];
