/**
 * Lowering of "you may play cards this way without paying their mana costs" (Ignite the Future, CR 118.9, 601.2, 611.2a): the engine's `mayPlay` of the cards the exile before it moved, with
 * `free`, lasting as long as the permission before it (`ctx.mayPlayLasts`). Refused unless an earlier sentence of the text gave such a permission.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

export const MAY_PLAY_THIS_WAY_FREE: Lowering<IrClause, Effects> = {
  head: 'mayPlayThisWayFree',
  id: 'lower.may-play-this-way-free',
  needs: ['effect:mayPlay'],
  acceptsOptional: true,
  lower(clause, ctx) {
    if (ctx.mayPlayLasts === null || ctx.exiled !== 'top') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'mayPlay', objects: { kind: 'moved' }, lasts: ctx.mayPlayLasts, free: true }],
      rule: clause.rule,
    };
  },
};

export const MAY_PLAY_THIS_WAY_FREE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  MAY_PLAY_THIS_WAY_FREE,
];
