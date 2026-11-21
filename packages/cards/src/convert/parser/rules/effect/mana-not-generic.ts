/**
 * Effect rule of the mana restriction "This mana can't be spent to pay generic mana costs." (CR 106.6; Jegantha, the Wellspring): a sentence about the mana ability before it, as
 * "Spend this mana only to cast an Angel spell." is.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.mana-not-generic`: "This mana can't be spent to pay generic mana costs." (CR 106.6: a mana ability may restrict what its mana can be spent on). It says something about the
 * mana ability before it: the lowering of that ability gives the engine's `spendOnly` with `notGeneric`; anywhere else it is read and not run. Not read: other costs ("colored mana
 * costs"), other mana than "this mana", a spend that is allowed, a sentence with more after it.
 */
export const EFFECT_MANA_NOT_GENERIC = defineRule<Clauses>({
  id: 'effect.mana-not-generic',
  family: 'effect',
  leading: ['this'],
  cites: ['CR 106.6 (Mana)', 'CR 605.1a (Mana Abilities)'],
  examples: ["this mana can't be spent to pay generic mana costs"],
  rejects: [
    "this mana can't be spent to pay colored mana costs",
    "this mana can't be spent to pay generic mana",
    "this mana can't be spent to pay generic mana costs and draw a card",
    "this mana can't be spent to pay for generic mana costs",
    'this mana can be spent to pay generic mana costs',
    "that mana can't be spent to pay generic mana costs",
    "this creature can't be spent to pay generic mana costs",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.mana-not-generic';
    const r = spanned(
      pattern(new RegExp(`this mana can't be spent to pay generic mana costs${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'spendOnly',
          { notGeneric: { kind: 'flag' as const, value: true, span, rule: id } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const MANA_NOT_GENERIC_EFFECT_RULES = [EFFECT_MANA_NOT_GENERIC];
