import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

export const PREPARE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  {
    head: 'prepare',
    id: 'lower.prepare',
    needs: ['effect:prepare'],
    lower: (clause) => ({
      ok: true,
      value: [{ kind: 'prepare', objects: { kind: 'this' } }],
      rule: clause.rule,
    }),
  },
  {
    head: 'delayedCombatPrepare',
    id: 'lower.delayed-combat-prepare',
    needs: ['effect:delayedCombatDamage', 'effect:prepare'],
    lower: (clause, ctx) => {
      const objects = arg(clause, 'objects');
      if (objects?.kind !== 'noun') return failure(clause);
      const lowered = objectSelectorOf(objects, ctx);
      if (!lowered.ok) return lowered;
      return {
        ok: true,
        value: [
          {
            kind: 'delayedCombatDamage',
            objects: lowered.value,
            effect: { kind: 'prepare', objects: { kind: 'this' } },
          },
        ],
        rule: clause.rule,
      };
    },
  },
];
