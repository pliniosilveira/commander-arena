/**
 * Lowering of the copy of an exiled card that is cast for mana rather than its mana cost (Blue Mage's Cane, CR 707.12, 608.2g, 118.9, 601.2f): the engine's `copyCardAndCast` of the card
 * the exile before it moved, with the mana the text names as its `cost`. Same contract as `lower/prismari-g2.ts`, whose lowering casts the copy for free.
 */
import type { Cost, Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

const COPY_CARD_AND_CAST_PAYING: Lowering<IrClause, Effects> = {
  head: 'copyCardAndCastPaying',
  id: 'lower.copy-card-and-cast-paying',
  needs: ['effect:copyCardAndCast', 'selector:moved'],
  lower(clause, ctx) {
    // The card the exile before it put into exile (`moved`): the exile of a target the text chose, which the grammar read first (the two clauses of one rule).
    if (ctx.exiledRef === null) return failure(clause);
    const costs = arg(clause, 'cost');
    if (costs?.kind !== 'costList') return failure(clause);
    const mana: Cost[] = [];
    for (const cost of costs.costs) {
      if (cost.kind !== 'mana' || cost.symbols.length === 0) return failure(clause);
      mana.push({ kind: 'mana', symbols: [...cost.symbols] });
    }
    if (mana.length === 0) return failure(clause);
    const effect: Effect = { kind: 'copyCardAndCast', objects: { kind: 'moved' }, cost: mana };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const COPY_CAST_PAYING_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  COPY_CARD_AND_CAST_PAYING,
];
