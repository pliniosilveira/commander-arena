/**
 * Lowering of the Jump Scare! deck (issue 108, group C): "Draw a card, then you may return a land you control to its owner's hand." (Kefnet the Mindful).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "... then you may return a land you control to its owner's hand" (CR 608.2d, 400.3, 108.3): the engine's `may` of a `moveToZone` of one permanent the controller chooses, as the
 * instruction runs, among those of the kind they control.
 */
const MAY_RETURN_OWN: Lowering<IrClause, Effects> = {
  head: 'mayReturnOwn',
  id: 'lower.may-return-own',
  needs: ['effect:may', 'effect:moveToZone', 'selector:choose'],
  lower(clause) {
    const noun = arg(clause, 'objects');
    if (noun?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(noun);
    if (!filter.ok) return filter;
    if (filter.value.controller !== 'you' || filter.value.zone !== undefined) {
      return failure(clause);
    }
    const moved: Effect = {
      kind: 'moveToZone',
      objects: { kind: 'choose', filter: filter.value },
      to: 'hand',
    };
    return { ok: true, value: [{ kind: 'may', effect: moved }], rule: clause.rule };
  },
};

export const THEN_MAY_RETURN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MAY_RETURN_OWN];

/** Features the lowerings of this file can name, for the dimension test. */
export const THEN_MAY_RETURN_NEEDS: readonly FeatureRef[] = [
  'effect:may',
  'effect:moveToZone',
  'selector:choose',
];
