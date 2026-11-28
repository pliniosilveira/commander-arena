/**
 * Lowering of "Target artifact becomes an artifact creature." (Tezzeret, Betrayer of Flesh, issue 128; CR 205.1b, 611.2a, 613.1d): the engine's additive `setTypes` of what the operand names,
 * with the duration `permanent` (no end but the permanent leaving the battlefield, CR 400.7).
 */
import type { IrClause } from '../ir/types';
import { type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

export const BECOMES_ARTIFACT_CREATURE_PERMANENTLY: Lowering<IrClause, Effects> = {
  head: 'becomesArtifactCreaturePermanently',
  id: 'lower.becomes-artifact-creature-permanently',
  needs: ['effect:setTypes'],
  lower(clause, ctx) {
    const made = eachObject(clause, ctx, (objects) => ({
      kind: 'setTypes',
      objects,
      types: ['artifact', 'creature'],
      additive: true,
      duration: 'permanent',
    }));
    return made.ok && made.value.length === 1 ? made : failure(clause);
  },
};

export const BECOMES_PERMANENTLY_LOWERINGS = [BECOMES_ARTIFACT_CREATURE_PERMANENTLY];
