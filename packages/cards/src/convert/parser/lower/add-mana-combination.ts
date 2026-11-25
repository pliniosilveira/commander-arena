/**
 * Lowering of "Add X mana in any combination of {R} and/or {G}, where X is the number of creatures you control." (Xenagos, the Reveler, CR 106.1b, 608.2d): the engine's
 * `addManaCombination`. An effect of a spell or of an ability that uses the stack; a mana ability has its own lowering and never reaches this one.
 */
import type { ManaColor } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

const COLORS: readonly string[] = ['W', 'U', 'B', 'R', 'G'];

export const ADD_MANA_COMBINATION: Lowering<IrClause, Effects> = {
  head: 'addManaCombination',
  id: 'lower.add-mana-combination',
  needs: ['effect:addManaCombination'],
  lower(clause, ctx) {
    const mana = arg(clause, 'mana');
    if (mana?.kind !== 'manaSpec' || mana.what.kind !== 'symbols') return failure(clause);
    const [first, second, ...more] = mana.what.symbols;
    if (
      first === undefined ||
      second === undefined ||
      more.length > 0 ||
      !COLORS.includes(first) ||
      !COLORS.includes(second)
    ) {
      return failure(clause);
    }
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    return {
      ok: true,
      value: [
        {
          kind: 'addManaCombination',
          colors: [first as ManaColor, second as ManaColor],
          amount: amount.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const ADD_MANA_COMBINATION_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  ADD_MANA_COMBINATION,
];
