/**
 * Lowering of "Choose up to two creatures, then destroy the rest." (Mount Doom, CR 608.2d, 701.8a): the engine's `chooseObjects` of up to N creatures (any player's, no target), then a
 * `destroy` of each creature that was not chosen.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** The id the chosen creatures are remembered under: no other effect of the same ability names creatures this way. */
const KEPT = 'kept';

const KEEP_UP_TO_AND_DESTROY: Lowering<IrClause, Effects> = {
  head: 'keepUpToAndDestroy',
  id: 'lower.keep-up-to-and-destroy',
  needs: ['effect:chooseObjects', 'effect:destroy'],
  lower(clause) {
    const limit = clause.args.limit;
    if (limit?.kind !== 'number') return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'chooseObjects', id: KEPT, filter: { types: ['creature'] }, count: limit.value },
        {
          kind: 'destroy',
          objects: {
            kind: 'each',
            filter: { types: ['creature'] },
            except: { kind: 'chosen', id: KEPT },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const KEEP_DESTROY_REST_LOWERINGS = [KEEP_UP_TO_AND_DESTROY];
