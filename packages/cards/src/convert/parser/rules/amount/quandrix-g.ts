/**
 * The amounts of the Quandrix Unlimited deck, group G: "equal to the damage dealt" (CR 120.3, 510.2: the combat damage the trigger of "Whenever one or more creatures
 * you control deal combat damage to a player" carries).
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.damage-dealt-by-trigger`: "equal to the damage dealt" (CR 120.3, 510.2, 603.2c: all the combat damage the sources of the batch trigger dealt to the
 * player). The engine's `triggerDamage`, which `validateCard` allows only in a trigger that has damage; the lowering refuses it anywhere else. Not read: "this way",
 * "this turn", "that damage", a missing "the", a trailing "plus".
 */
export const AMOUNT_DAMAGE_DEALT_BY_TRIGGER = defineRule<IrAmount>({
  id: 'amount.damage-dealt-by-trigger',
  family: 'amount',
  leading: ['equal'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 510.2 (Combat Damage Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['equal to the damage dealt'],
  rejects: [
    'the damage dealt',
    'equal to damage dealt',
    'equal to the damage dealt this way',
    'equal to the damage dealt this turn',
    'equal to the damage dealt plus 1',
    'equal to the damage',
    'equal to the damage dealt to target opponent this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/equal to the damage dealt(?! this| plus| to |[\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'triggerDamage', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const QUANDRIX_G_AMOUNT_RULES = [AMOUNT_DAMAGE_DEALT_BY_TRIGGER];
