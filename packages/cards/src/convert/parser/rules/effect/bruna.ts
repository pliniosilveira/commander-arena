/**
 * Effect rules of the Bruna deck (D-256, D-257): the two phrases of the cards that read the life they gained.
 *
 * - `effect.do-once-each-turn`: "Do this only once each turn." (CR 603.2h): the last sentence of a triggered ability, no instruction of its own but the
 *   engine's `doOnlyOnceEachTurn` of the ability before it (the ability triggers only if its controller has not yet taken the action that turn).
 *   The lowering of the ability that holds it reads it; anywhere else it is read and not run.
 * - `effect.pay-x-at-most`: "pay {X}, where X is less than or equal to the amount of life you gained" (CR 107.3f, 118.1, 119.9): an offer of a payment
 *   of any number of generic mana up to what a life gain trigger names, which "If you do, ..." after it buys. The lowering of the sentences reads the two.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** `effect.do-once-each-turn`: "Do this only once each turn." */
export const EFFECT_DO_ONCE_EACH_TURN = defineRule<Clauses>({
  id: 'effect.do-once-each-turn',
  family: 'effect',
  leading: ['do'],
  cites: ['CR 603.2h (Handling Triggered Abilities)'],
  examples: ['do this only once each turn', 'Do this only once each turn'],
  rejects: [
    'do this only once',
    'do this only twice each turn',
    'do this once each turn',
    'do this only once each turn and draw a card',
    'do that only once each turn',
    'this ability triggers only once each turn',
    'do this only once each combat',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`do this only once each turn${BOUNDARY}`, 'iu')))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.do-once-each-turn', 'doOnceEachTurn', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/** `effect.pay-x-at-most`: "pay {X}, where X is less than or equal to the amount of life you gained". */
export const EFFECT_PAY_X_AT_MOST = defineRule<Clauses>({
  id: 'effect.pay-x-at-most',
  family: 'effect',
  leading: ['pay'],
  cites: [
    'CR 107.3f (Numbers and Symbols)',
    'CR 118.1 (Costs)',
    'CR 119.9 (Life)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['pay {X}, where X is less than or equal to the amount of life you gained'],
  rejects: [
    'pay {X}',
    'pay {X}, where X is less than or equal to the amount of life you lost',
    'pay {X}, where X is less than the amount of life you gained',
    'pay {X}, where X is the amount of life you gained',
    'pay {X}, where X is less than or equal to the amount of life an opponent gained',
    'pay {X}, where X is less than or equal to 3',
    'pay X, where X is less than or equal to the amount of life you gained',
    'pay {X}{X}, where X is less than or equal to the amount of life you gained',
    'pay {X}, where X is less than or equal to the amount of life you gained and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `pay \\{X\\}, where X is less than or equal to the amount of life you gained${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.pay-x-at-most',
          'payXAtMost',
          { atMost: { kind: 'triggerDamage', span } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const BRUNA_EFFECT_RULES = [EFFECT_DO_ONCE_EACH_TURN, EFFECT_PAY_X_AT_MOST].map(quietly);
