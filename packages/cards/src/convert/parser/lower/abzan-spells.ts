/**
 * Clause lowerings of the Abzan Armor precon, group C (spells with choices): the same contract as effects.ts (each declares the engine features it needs).
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Choose a number between 0 and 10." (Expel the Interlopers, CR 608.2d, 107.1): the engine's `chooseNumber`; the instructions after it read the number as
 * `powerAtLeastChosenNumber`.
 */
const CHOOSE_NUMBER: Lowering<IrClause, Effects> = {
  head: 'chooseNumber',
  id: 'lower.choose-number',
  needs: ['effect:chooseNumber'],
  lower(clause) {
    const min = clause.args.min;
    const max = clause.args.max;
    if (min?.kind !== 'number' || max?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'chooseNumber', min: min.value, max: max.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control." (Slaughter the Strong, CR 608.2d, 701.21a,
 * 101.4): the engine's `keepOrSacrifice` of each player.
 */
const KEEP_OR_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'keepOrSacrifice',
  id: 'lower.keep-or-sacrifice',
  needs: ['effect:keepOrSacrifice'],
  lower(clause) {
    const limit = clause.args.limit;
    if (limit?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'keepOrSacrifice',
          players: { kind: 'eachPlayer' },
          filter: { types: ['creature'] },
          totalPowerAtMost: limit.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const ABZAN_SPELLS_LOWERINGS = [CHOOSE_NUMBER, KEEP_OR_SACRIFICE];
