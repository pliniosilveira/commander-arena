/**
 * The amount of the Ahoy Mateys deck, group 1 (Malcolm, Keen-Eyed Navigator): "for each opponent dealt damage".
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-opponent-dealt-damage`: "for each opponent dealt damage" (CR 603.2c, 120.2: the opponents that the group of sources of the trigger dealt damage to in the one
 * event). The engine's `triggerDamagedPlayerCount`, valid in a trigger of `trigger.damage-batch` "to your opponents". Not read: "for each opponent", "for each opponent who lost life",
 * "for each player dealt damage", the plural "opponents", "dealt combat damage".
 */
export const AMOUNT_FOR_EACH_OPPONENT_DEALT_DAMAGE = defineRule<IrAmount>({
  id: 'amount.for-each-opponent-dealt-damage',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 603.2c (Handling Triggered Abilities)', 'CR 120.2 (Damage)'],
  examples: ['for each opponent dealt damage'],
  rejects: [
    'for each opponent',
    'for each opponent who lost life',
    'for each player dealt damage',
    'for each opponents dealt damage',
    'for each opponent dealt combat damage',
    'for each opponent dealt damage this turn',
    'each opponent dealt damage',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each opponent dealt damage(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'triggerDamagedPlayerCount', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const DAMAGED_PLAYERS_AMOUNT_RULES = [AMOUNT_FOR_EACH_OPPONENT_DEALT_DAMAGE];
