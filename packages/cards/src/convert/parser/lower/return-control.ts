/**
 * Lowering of "Each player gains control of all creatures they own." (issue 160, D-612, CR 613.1b): the engine's `returnControlToOwners` of every creature on the
 * battlefield.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

export const RETURN_CONTROL_TO_OWNERS: Lowering<IrClause, Effects> = {
  head: 'returnControlToOwners',
  id: 'lower.return-control-to-owners',
  needs: ['effect:returnControlToOwners', 'selector:each'],
  lower(clause) {
    return {
      ok: true,
      value: [
        {
          kind: 'returnControlToOwners',
          objects: { kind: 'each', filter: { types: ['creature'], zone: 'battlefield' } },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const RETURN_CONTROL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  RETURN_CONTROL_TO_OWNERS,
];
