/**
 * Lowering of "Choose one of them." (Tectonic Giant, CR 608.2d): the engine's `opponentChoosesCard` with `byController` and `keepChosen`, over the cards the instruction before it moved. Refused
 * unless that instruction exiled cards from a library (`ctx.exiled`), the cards "them" names.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import { failure } from './clauses';
import type { Lowering } from './types';

export const CHOOSE_ONE_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'chooseOneOfThem',
  id: 'lower.choose-one-of-them',
  needs: ['effect:opponentChoosesCard'],
  lower(clause, ctx) {
    if (ctx.exiled !== 'top' || ctx.exiledFaceDown) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'opponentChoosesCard',
          objects: { kind: 'moved' },
          filter: {},
          byController: true,
          keepChosen: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const CHOOSE_ONE_OF_THEM_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CHOOSE_ONE_OF_THEM,
];
