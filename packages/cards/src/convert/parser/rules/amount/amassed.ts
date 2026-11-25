/**
 * Value phrases of the Sauron deck's amass and excess damage cards, atoms of the value family ("..., where X is ..."; `amount.where-x` carries their examples and rejects).
 *
 * - "the amassed Army's power" (Surrounded by Orcs, CR 701.47a, 701.47b, 208.1): the power of the Army creature the amass before it in the same text chose, which counts as amassed even
 *   when no counter was put on it. The engine's `powerOf` of `moved`; the lowering refuses it after any instruction but an amass.
 * - "that excess damage" (Fall of Cair Andros, CR 120.10): the excess of the damage a "dealt excess damage" trigger is about. The engine's `triggerDamage` of that trigger.
 */
import { type Parser, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';

/** "the amassed Army's power" (the apostrophe straight or curly). */
export const AMASSED_ARMY_POWER: Parser<IrAmount> = (ctx, pos) => {
  const r = pattern(/the amassed Army['’]s power(?![\p{L}\p{N}])/iu)(ctx, pos);
  return r.ok
    ? {
        ok: true,
        value: { kind: 'amassedArmyPower', span: { start: pos, end: r.pos } },
        pos: r.pos,
      }
    : r;
};

/** "that excess damage": the damage of the "dealt excess damage" trigger above the lethal amount. */
export const EXCESS_DAMAGE_OF_TRIGGER: Parser<IrAmount> = (ctx, pos) => {
  const r = pattern(/that excess damage(?![\p{L}\p{N}])/iu)(ctx, pos);
  return r.ok
    ? {
        ok: true,
        value: { kind: 'triggerDamage', excess: true, span: { start: pos, end: r.pos } },
        pos: r.pos,
      }
    : r;
};
