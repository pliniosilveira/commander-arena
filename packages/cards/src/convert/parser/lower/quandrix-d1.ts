/**
 * Lowering of "... and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way" (Oversimplify, CR 122.6, 608.2c,
 * 608.2h): the engine's `addCounters` on the tokens the effect before it made (`moved`), read for the controller of each token (`perController`): the `thisWay` count
 * `exiledPowerOwn` is the total power of the creatures that player controlled that the `exile` effects of this resolution really exiled. The engine's `validateCard`
 * refuses the count without an `exile` before it in the same sequence.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

const ADD_EXILED_POWER_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'addExiledPowerCounters',
  id: 'lower.add-exiled-power-counters',
  needs: ['effect:addCounters', 'selector:moved', 'amount:thisWay'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'addCounters',
        objects: { kind: 'moved' },
        counter: '+1/+1',
        count: { kind: 'thisWay', what: 'exiledPowerOwn' },
        perController: true,
      },
    ],
    rule: clause.rule,
  }),
};

export const QUANDRIX_D1_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  ADD_EXILED_POWER_COUNTERS,
];
