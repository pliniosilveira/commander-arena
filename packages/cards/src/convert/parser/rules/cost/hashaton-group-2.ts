/**
 * Costs of the Hashaton deck program, group 2 (D-364, provisional): "pay that much life" (CR 119.4, 118.3), the life that caused the trigger the offer is
 * the effect of. Read only by `effect.pay` (the offer "you may pay that much life"); the lowering of any other cost refuses it.
 */
import { pattern } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `cost.pay-life-that-much`: "pay that much life" (CR 119.4: the payment needs a life total at least that high; CR 118.3; CR 119.9: the life gained is the
 * amount of the event that triggered the ability). The amount is the engine's `triggerDamage`, which `validateCard` allows only in a trigger with an amount
 * (a life gain, damage dealt), and the `mayPay` that holds it works out once the offer is made. Its own rule, not a form of `cost.pay-life`, so the keyword
 * costs that name "pay N life" (Cycling, Equip, Ward) do not read it. Not read: "pay that many life", "pay that much", "pay half that much life", "pay that much mana".
 */
export const COST_PAY_LIFE_THAT_MUCH = defineRule<IrCost>({
  id: 'cost.pay-life-that-much',
  family: 'cost',
  leading: ['pay'],
  cites: ['CR 119.4 (Life)', 'CR 118.3 (Costs)', 'CR 119.9 (Life)'],
  examples: ['Pay that much life', 'pay that much life'],
  rejects: [
    'Pay that much',
    'Pay that many life',
    'Pay life',
    'Pay half that much life',
    'Pay that much life and',
    'Pay that much mana',
    'Pay twice that much life',
    'Pay 2 life',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/pay that much life(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'payLife',
        amount: { kind: 'triggerDamage', span },
        span,
        rule: 'cost.pay-life-that-much',
      },
      pos: r.pos,
    };
  },
});

export const HASHATON_G2_COST_RULES = [COST_PAY_LIFE_THAT_MUCH];
