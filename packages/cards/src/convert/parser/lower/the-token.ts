/**
 * Lowering of "At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}." (Ashling, the Limitless; CR 118.12a, 701.21a, 603.7c): the instruction of the delayed
 * sentence, about the tokens the instruction before it made (`ctx.tokensMade`, the engine's `moved`); after anything else it is not lowered (never guessed).
 */
import type { Cost } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerCost } from './costs';
import type { Lowering } from './types';

const SACRIFICE_MADE_UNLESS_PAYS: Lowering<IrClause, Effects> = {
  head: 'sacrificeMadeUnlessPays',
  id: 'lower.sacrifice-made-unless-pays',
  needs: ['effect:unlessPays', 'effect:sacrifice', 'selector:moved', 'cost:mana'],
  lower(clause, ctx) {
    const costs = arg(clause, 'cost');
    if (costs?.kind !== 'costList' || !ctx.tokensMade) return failure(clause);
    const lowered: Cost[] = [];
    for (const c of costs.costs) {
      const one = lowerCost(c, { unless: true });
      if (!one.ok) return one;
      lowered.push(one.value);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'unlessPays',
          player: { kind: 'you' },
          cost: lowered,
          effect: { kind: 'sacrifice', objects: { kind: 'moved' } },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const THE_TOKEN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SACRIFICE_MADE_UNLESS_PAYS,
];
