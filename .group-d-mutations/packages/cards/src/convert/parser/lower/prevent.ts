/**
 * Clause lowering of stage P7a: damage prevention shields (CR 615). "Prevent all combat damage that
 * would be dealt this turn." is one `preventDamage` node; a list of recipients is one node each, in
 * text order (CR 615.1: each is its own shield); "dealt to and dealt by X" is the node for damage
 * dealt to X and the node for damage dealt by X. The duration is always "this turn", which the engine
 * runs as `untilEndOfTurn` (CR 514.2). Same contract as effects.ts: the features are checked before
 * `lower` runs, and a selector's own features are checked when it is lowered.
 */
import type { Effect, ObjectRef, PreventRecipient, PreventScope } from '@commander-arena/engine';
import type { IrClause, IrNoun } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { itemsOf, lowerFilter, objectRefOf, recipientOf } from './nouns';
import type { LowerContext, Lowering, LowerResult } from './types';

/**
 * A shield on "each creature you control" says nothing of the zone: only a permanent on the
 * battlefield can be dealt damage (CR 120.1), and the engine checks the filter as damage is dealt
 * (CR 611.2c), so the filter the noun carried is the one without `zone`.
 */
function recipient(noun: IrNoun, ctx: LowerContext): LowerResult<PreventRecipient> {
  const lowered = recipientOf(noun, ctx);
  if (!lowered.ok) return lowered;
  const value = lowered.value;
  if (value.kind !== 'each' || value.filter.zone !== 'battlefield') {
    return { ok: true, value, rule: lowered.rule };
  }
  const { zone, ...filter } = value.filter;
  void zone;
  return { ok: true, value: { kind: 'each', filter }, rule: lowered.rule };
}

function sameNoun(a: IrNoun, b: IrNoun): boolean {
  return a.span.start === b.span.start && a.span.end === b.span.end;
}

export const PREVENT_DAMAGE: Lowering<IrClause, Effects> = {
  head: 'preventDamage',
  id: 'lower.prevent-damage',
  needs: ['effect:preventDamage', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const scope = arg(clause, 'scope');
    // "for as long as ~ remains on the battlefield" (stage P50, D-207, CR 611.2b): the shield of an ability of a permanent.
    const whileRemains = clause.duration?.scope === 'whileSelfRemains';
    if (scope?.kind !== 'damageScope' || (clause.duration?.scope !== 'thisTurn' && !whileRemains)) {
      return failure(clause);
    }
    if (whileRemains) {
      const blocked = missingFeatures(['duration:forAsLongAsThisRemains']);
      if (blocked.length > 0)
        return { ok: false, needs: blocked, at: clause.span, rule: clause.rule };
    }
    const amount = scope.amount;
    if (amount !== 'all' && !(Number.isInteger(amount) && amount >= 1)) return failure(clause);
    const to = operand(clause, 'to');
    const byArg = arg(clause, 'by');
    if (byArg !== undefined && byArg.kind !== 'noun') return failure(clause);
    const base = {
      scope: scope.scope as PreventScope,
      amount,
      duration: whileRemains ? ('forAsLongAsThisRemains' as const) : ('untilEndOfTurn' as const),
    };

    let by: ObjectRef | undefined;
    if (byArg !== undefined) {
      const ref = objectRefOf(byArg, ctx);
      if (!ref.ok) return ref;
      by = ref.value;
    }
    // "to and dealt by X": the same noun said as both, two shields (damage to X, damage by X).
    // "by non-Spider creatures" (stage P32, D-147, CR 615.1, 609.7): a group of sources, as each damage event would happen, which the
    // engine reads as the filter of the source (`byFilter`, never with a recipient or a source of its own).
    const groupArg = arg(clause, 'byFilter');
    if (groupArg !== undefined) {
      if (groupArg.kind !== 'noun' || to !== undefined || byArg !== undefined)
        return failure(clause);
      const { zone: _zone, ...filter } = groupArg.filter;
      void _zone;
      const byFilter = lowerFilter({ ...groupArg, det: 'each', filter });
      if (!byFilter.ok) return byFilter;
      return {
        ok: true,
        value: [{ kind: 'preventDamage', ...base, to: { kind: 'any' }, byFilter: byFilter.value }],
        rule: clause.rule,
      };
    }
    const toAndBy = to?.kind === 'noun' && byArg !== undefined && sameNoun(to, byArg);
    if (to !== undefined && byArg !== undefined && !toAndBy) return failure(clause);

    const effects: Effect[] = [];
    if (to === undefined) {
      effects.push({ kind: 'preventDamage', ...base, to: { kind: 'any' }, ...(by ? { by } : {}) });
    } else {
      for (const item of itemsOf(to)) {
        const lowered = recipient(item, ctx);
        if (!lowered.ok) return lowered;
        effects.push({ kind: 'preventDamage', ...base, to: lowered.value });
      }
      if (toAndBy && by !== undefined) {
        effects.push({ kind: 'preventDamage', ...base, to: { kind: 'any' }, by });
      }
    }
    return { ok: true, value: effects, rule: clause.rule };
  },
};
