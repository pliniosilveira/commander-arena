/**
 * Replacement rules of stage P33 (D-149, D-150): "If you would gain life, you gain that much life plus 1 instead." (CR 119.10, 614.1a: a
 * replacement effect of the permanent that changes how much life its controller gains; it replaces the gain of an effect and of lifelink alike).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.life-gain-bonus`: "If you would gain life, you gain that much life plus 1 instead.", "If you would gain life, you gain that
 * much life plus two instead." (CR 119.10, 614.1a, 614.12: every gain of life of the controller, by an effect or by lifelink, is more by
 * that number; a gain of 0 is no event and is not replaced). The player is the controller of the permanent; the number is one or more.
 * Not read: another player ("If an opponent would gain life"), another replacement ("you gain twice that much life", "you don't gain
 * life instead"), a different number format ("plus X") and a condition.
 */
export const REPLACEMENT_LIFE_GAIN_BONUS = defineRule<IrAbility>({
  id: 'replacement.life-gain-bonus',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 119.10 (Life)',
    'CR 614.1a (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 702.15 (Lifelink)',
  ],
  examples: [
    'If you would gain life, you gain that much life plus 1 instead.',
    'If you would gain life, you gain that much life plus two instead.',
    'If you would gain life, you gain that much life plus 3 instead.',
  ],
  rejects: [
    'If you would gain life, you gain that much life plus 1 instead',
    'If you would gain life, you gain that much life plus X instead.',
    'If you would gain life, you gain that much life plus 0 instead.',
    'If you would gain life, you gain that much life instead.',
    'If you would gain life, you gain that much life plus 1.',
    'If you would gain life, you gain twice that much life instead.',
    'If an opponent would gain life, they gain that much life plus 1 instead.',
    'If a player would gain life, that player gains that much life plus 1 instead.',
    'If you would gain life, you gain that much life plus 1 instead. Draw a card.',
    'If you would gain life, you gain that much life minus 1 instead.',
    'If you would gain 3 life, you gain that much life plus 1 instead.',
    'If you would gain life, you lose that much life plus 1 instead.',
    'If you would lose life, you lose that much life plus 1 instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.life-gain-bonus';
    const r = sequence(
      literal('if you would gain life, you gain that much life plus '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ instead(?![\p{L}\p{N}])/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, amount] = r.value;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'lifeGainBonus',
      args: { amount: { kind: 'number', value: amount.value, span: amount.span } },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const ANGEL_REPLACEMENT_RULES = [REPLACEMENT_LIFE_GAIN_BONUS].map(quietly);
