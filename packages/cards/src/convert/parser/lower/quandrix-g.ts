/**
 * Lowerings of the Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6).
 */
import type { Amount } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { lowerAmount } from './amounts';
import { arg, type Effects, failure, operand } from './clauses';
import { declareDividedTarget, objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6, 107.3a): the targets slot with `divide` (the total is the X the spell
 * announces, or a number, read as the spell is cast) and the engine's `distributeCounters` to it. A spell's own text only: the validation refuses a division of X in an ability.
 */
export const DISTRIBUTE_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'distributeCounters',
  id: 'lower.distribute-counters',
  needs: ['effect:distributeCounters', 'selector:target'],
  lower(clause, ctx) {
    const to = operand(clause, 'to');
    const counter = arg(clause, 'counter');
    const count = arg(clause, 'count');
    if (to?.kind !== 'noun' || to.det !== 'target' || counter?.kind !== 'counterSpec') {
      return failure(clause);
    }
    if (count === undefined || (count.kind !== 'number' && count.kind !== 'x')) {
      return failure(clause);
    }
    if (ctx.owner !== 'spell') return failure(clause);
    const amount = lowerAmount(count, ctx, clause.rule);
    if (!amount.ok) return amount;
    const total: Amount = amount.value;
    const id = declareDividedTarget(to, ctx, total);
    if (!id.ok) return id;
    return {
      ok: true,
      value: [
        { kind: 'distributeCounters', to: { kind: 'target', id: id.value }, counter: counter.name },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Remove a +1/+1 counter from ~" (CR 122.1, 122.2): the engine's `removeCounters` of the permanent with the ability (`~`, or "it" in an ability about itself); it does something
 * only when a counter of the kind was there, which "If you do" reads (CR 608.2c).
 */
export const REMOVE_COUNTERS_SELF: Lowering<IrClause, Effects> = {
  head: 'removeCountersSelf',
  id: 'lower.remove-counters-self',
  needs: ['effect:removeCounters'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const count = arg(clause, 'count');
    const from = arg(clause, 'from');
    if (counter?.kind !== 'counterSpec' || from?.kind !== 'noun' || count?.kind !== 'number') {
      return failure(clause);
    }
    const objects = objectSelectorOf(from, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'this') return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'removeCounters', objects: objects.value, counter: counter.name, count: count.value },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Choose odd or even. Return each creature with power of the chosen quality to its owner's hand." (CR 608.2d, 208.1, 400.3): the engine's `chooseOne` of two instructions, each the
 * return of every creature whose power is odd (or even) as that instruction runs; the creatures are those on the battlefield, whoever controls them, and each goes to its owner's hand.
 */
export const CHOOSE_PARITY_RETURN: Lowering<IrClause, Effects> = {
  head: 'chooseParityReturn',
  id: 'lower.choose-parity-return',
  needs: ['effect:chooseOne', 'effect:moveToZone', 'selector:powerParity'],
  lower(clause) {
    const give = (powerParity: 'odd' | 'even') => ({
      label: powerParity,
      effect: {
        kind: 'moveToZone' as const,
        objects: {
          kind: 'each' as const,
          filter: { zone: 'battlefield' as const, types: ['creature' as const], powerParity },
        },
        to: 'hand' as const,
      },
    });
    return {
      ok: true,
      value: [{ kind: 'chooseOne', options: [give('odd'), give('even')] }],
      rule: clause.rule,
    };
  },
};

export const QUANDRIX_G_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DISTRIBUTE_COUNTERS,
  REMOVE_COUNTERS_SELF,
  CHOOSE_PARITY_RETURN,
];
