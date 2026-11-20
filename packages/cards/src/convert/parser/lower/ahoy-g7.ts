/**
 * Lowerings of group 7 of the Ahoy Mateys deck (control and "until" effects): "That creature doesn't untap during its controller's untap step for as long as you control ~."
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "That creature doesn't untap during its controller's untap step for as long as you control ~." (CR 502.3, 611.2b, 611.2c): the engine's `restrict` of `doesntUntap` with the duration
 * `forAsLongAsYouControlThis`, for the object an earlier instruction named (or a target); an ability of a permanent only (the engine refuses it elsewhere).
 */
const DOESNT_UNTAP_WHILE_CONTROLLING: Lowering<IrClause, Effects> = {
  head: 'doesntUntapWhileControlling',
  id: 'lower.doesnt-untap-while-controlling',
  needs: ['effect:restrict', 'duration:forAsLongAsYouControlThis'],
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun') return failure(clause);
    const blocked = missingFeatures(['effect:restrict', 'duration:forAsLongAsYouControlThis']);
    if (blocked.length > 0)
      return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    const selector = objectSelectorOf(objects, ctx, { eachMention: true, triggerSubject: true });
    if (!selector.ok) return selector;
    const effect: Effect = {
      kind: 'restrict',
      objects: selector.value,
      restriction: 'doesntUntap',
      duration: 'forAsLongAsYouControlThis',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const AHOY_G7_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DOESNT_UNTAP_WHILE_CONTROLLING,
];
