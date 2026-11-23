/**
 * The Aetherdrift energy deck (issue 105): "where X is the amount of {E} paid this way" (CR 107.3c, 107.14, 608.2c), the number of energy counters the player paid to the "you
 * may pay one or more {E}" before it. It is the X that the payment itself announces, so it reads as the engine's `x`, which `payAnyAmount` gives its follow-up.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

export const AMOUNT_WHERE_X_ENERGY_PAID = defineRule<IrAmount>({
  id: 'amount.where-x-energy-paid',
  family: 'amount',
  leading: ['where'],
  cites: [
    'CR 107.3c (Numbers and Symbols)',
    'CR 107.14 (Energy)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['where X is the amount of {E} paid this way'],
  rejects: [
    'where X is the amount of {E} paid',
    'where X is the amount of {E}',
    'where X is the amount of mana paid this way',
    'where X is the number of {E} paid this way',
    'X is the amount of {E} paid this way',
    'where X is the amount of {E}{E} paid this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/where X is the amount of \{E\} paid this way(?![\p{L}\p{N}])/u)(ctx, pos);
    if (!r.ok) return r;
    return { ok: true, value: { kind: 'x', span: { start: pos, end: r.pos } }, pos: r.pos };
  },
});

export const ENERGY_PAID_AMOUNT_RULES = [AMOUNT_WHERE_X_ENERGY_PAID];
