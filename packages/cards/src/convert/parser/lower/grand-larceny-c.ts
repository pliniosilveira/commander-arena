/**
 * Lowerings of group C of the Grand Larceny deck (issue 119): the delayed mana of Plasm Capture.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

/**
 * "At the beginning of your next first main phase, add X mana in any combination of colors, where X is that spell's mana value" (CR 603.7, 603.7c, 106.1b, 202.3): the engine's
 * `delayedTrigger` at the controller's next precombat main phase whose effect is `addManaCombination` over the five colors, the amount the mana value of the spell the ability
 * targeted, fixed as the delayed ability is created.
 */
const DELAYED_MANA_COMBINATION: Lowering<IrClause, Effects> = {
  head: 'delayedManaCombination',
  id: 'lower.delayed-mana-combination',
  needs: ['effect:delayedTrigger', 'effect:addManaCombination', 'amount:manaValueOf'],
  lower(clause, ctx) {
    const spell = arg(clause, 'spell');
    if (spell?.kind !== 'noun') return failure(clause);
    const ref = objectRefOf(spell, ctx);
    if (!ref.ok) return ref;
    if (ref.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'main1', whose: 'you' },
          effect: {
            kind: 'addManaCombination',
            colors: ['W', 'U', 'B', 'R', 'G'],
            amount: { kind: 'manaValueOf', of: { kind: 'target', id: ref.value.id } },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const GRAND_LARCENY_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DELAYED_MANA_COMBINATION,
];
