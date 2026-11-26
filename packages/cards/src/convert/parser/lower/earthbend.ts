/**
 * Lowerings of earthbend (Avatar: The Last Airbender keyword action): the engine's `earthbend` of the target land the keyword names ("target land you control", declared here),
 * and Toph, Hardheaded Teacher's extra counter for a Lesson spell ("that land" is the land the earthbend before it targeted).
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

const EARTHBEND: Lowering<IrClause, Effects> = {
  head: 'earthbend',
  id: 'lower.earthbend',
  needs: ['effect:earthbend', 'selector:target'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return eachObject(clause, ctx, (objects) => ({
      kind: 'earthbend',
      objects,
      count: count.value,
    }));
  },
};

const EARTHBEND_ADDITIONAL: Lowering<IrClause, Effects> = {
  head: 'earthbendAdditionalLesson',
  id: 'lower.earthbend-additional',
  needs: ['effect:addCounters', 'effect:conditional', 'condition:objectMatches'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'earthbend' || !ctx.castTrigger) return failure(clause);
    const last = ctx.targets[ctx.targets.length - 1];
    if (last === undefined) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'triggerSubject' },
            filter: { subtypes: ['Lesson'] },
          },
          effect: {
            kind: 'addCounters',
            objects: { kind: 'target', id: last.id },
            counter: '+1/+1',
            count: 1,
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EARTHBEND_LOWERINGS = [EARTHBEND, EARTHBEND_ADDITIONAL];
