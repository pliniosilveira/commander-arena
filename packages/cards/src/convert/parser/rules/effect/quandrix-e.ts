/**
 * Effect rules of group E of the Quandrix Unlimited deck: "Spend this mana only on costs that contain {X}." (CR 106.6, 107.3), a sentence about the mana ability before it, as
 * "Spend this mana only to cast an Angel spell." is.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.spend-only-x-cost`: "Spend this mana only on costs that contain {X}." (CR 106.6: a mana ability may restrict what its mana can be spent on; CR 107.3: an {X} in a cost). It
 * says something about the mana ability before it: the lowering of that ability gives the engine's `spendOnly` with `xCost`; anywhere else it is read and not run. Not read: another
 * cost, a symbol other than {X}, other mana than "this mana".
 */
export const EFFECT_SPEND_ONLY_X_COST = defineRule<Clauses>({
  id: 'effect.spend-only-x-cost',
  family: 'effect',
  leading: ['spend'],
  cites: ['CR 106.6 (Mana)', 'CR 107.3 (Mana Cost)', 'CR 605.1a (Mana Abilities)'],
  examples: ['spend this mana only on costs that contain {X}'],
  rejects: [
    'spend this mana only on costs that contain {Y}',
    'spend this mana only on costs that contain X',
    'spend this mana only on costs that contain',
    'spend this mana only on a cost that contains {X}',
    'spend this mana only on costs that contain {X} and draw a card',
    'spend this mana only on costs',
    'spend only this mana on costs that contain {X}',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`spend this mana only on costs that contain \\{X\\}${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.spend-only-x-cost',
          'spendOnly',
          { xCost: flag(r.value.span) },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

function flag(span: { start: number; end: number }) {
  return { kind: 'flag' as const, value: true, span, rule: 'effect.spend-only-x-cost' };
}

export const QUANDRIX_E_EFFECT_RULES = [EFFECT_SPEND_ONLY_X_COST];
