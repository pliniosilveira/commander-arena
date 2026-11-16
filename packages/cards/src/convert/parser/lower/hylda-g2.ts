/**
 * Lowerings of group 2 of the Hylda deck (issue 42, D-517 to D-525): "doesn't untap during its controller's next untap step", "until your next turn, creatures your opponents
 * control enter tapped".
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter, objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Target creature doesn't untap during its controller's next untap step.", "Those creatures don't untap during their controllers' next untap steps." (CR 502.3, 611.2a, 701.43b):
 * the engine's `restrict` of `doesntUntap` with the duration `untilNextUntapStep`, for the objects the noun names: a target, an object an earlier instruction named, or a group
 * ("those creatures" after "tap all creatures ..." is the same group again, `RefOptions.eachMention`).
 */
export const DOESNT_UNTAP_NEXT: Lowering<IrClause, Effects> = {
  head: 'doesntUntapNext',
  id: 'lower.doesnt-untap-next',
  needs: ['effect:restrict', 'duration:untilNextUntapStep'],
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun') return failure(clause);
    const selector = objectSelectorOf(objects, ctx, { eachMention: true });
    if (!selector.ok) return selector;
    const effect: Effect = {
      kind: 'restrict',
      objects: selector.value,
      restriction: 'doesntUntap',
      duration: 'untilNextUntapStep',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Until your next turn, creatures your opponents control enter tapped." (CR 614.1c, 614.12, 611.2a): the engine's `permanentsEnterTapped`, read as permanents enter, so the
 * filter names no zone.
 */
export const GROUP_ENTERS_TAPPED: Lowering<IrClause, Effects> = {
  head: 'groupEntersTapped',
  id: 'lower.group-enters-tapped',
  needs: ['effect:permanentsEnterTapped', 'duration:untilYourNextTurn'],
  takesDuration: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (
      objects?.kind !== 'noun' ||
      objects.det !== 'each' ||
      clause.duration?.scope !== 'untilYourNextTurn'
    ) {
      return failure(clause);
    }
    const { zone, ...rest } = objects.filter;
    void zone;
    const permanents = lowerFilter({ ...objects, filter: rest });
    if (!permanents.ok) return permanents;
    const effect: Effect = {
      kind: 'permanentsEnterTapped',
      permanents: permanents.value,
      duration: 'untilYourNextTurn',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const HYLDA_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DOESNT_UNTAP_NEXT,
  GROUP_ENTERS_TAPPED,
];
