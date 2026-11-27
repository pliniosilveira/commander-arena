/**
 * Lowering of the party (CR 700.8d): "each player chooses a party from among creatures they control, then sacrifices the rest" (Stick Together, CR 701.21a, 101.4): the engine's
 * `chooseParty` of each player.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

const CHOOSE_PARTY: Lowering<IrClause, Effects> = {
  head: 'chooseParty',
  id: 'lower.choose-party',
  needs: ['effect:chooseParty'],
  lower(clause) {
    return {
      ok: true,
      value: [{ kind: 'chooseParty', players: { kind: 'eachPlayer' } }],
      rule: clause.rule,
    };
  },
};

export const PARTY_LOWERINGS = [CHOOSE_PARTY];
