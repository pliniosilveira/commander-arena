/**
 * Lowering of the Revival Trance deck (issue 97), group D: "that player chooses up to two creatures they control, then sacrifices the rest" (Archfiend of Depravity, CR 608.2d,
 * 701.21a): the engine's `keepOrSacrifice` with `keepAtMost` of the player the subject names.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

const KEEP_UP_TO_AND_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'keepUpToAndSacrifice',
  id: 'lower.keep-up-to-and-sacrifice',
  needs: ['effect:keepOrSacrifice'],
  lower(clause, ctx) {
    const who = operand(clause, 'player');
    const limit = clause.args.limit;
    if (who === undefined || who.kind !== 'noun' || limit?.kind !== 'number') {
      return failure(clause);
    }
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    return {
      ok: true,
      value: [
        {
          kind: 'keepOrSacrifice',
          players: players.value,
          filter: { types: ['creature'] },
          keepAtMost: limit.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const KEEPS_UP_TO_LOWERINGS = [KEEP_UP_TO_AND_SACRIFICE];
