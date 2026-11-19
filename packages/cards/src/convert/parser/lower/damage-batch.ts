/**
 * Lowerings of the Multiverse Reforged deck (issue 81, Tamiyo, Upriser Crowned): the creatures that dealt the combat damage of a batch trigger, tapped and given a stun counter. Same
 * contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** "Tap those creatures" (CR 701.26a): the engine's `tap` of the `triggerSources` of a `combatDamageBatch` trigger. Refused in any other ability. */
const TAP_TRIGGER_SOURCES: Lowering<IrClause, Effects> = {
  head: 'tapTriggerSources',
  id: 'lower.tap-trigger-sources',
  needs: ['effect:tap', 'selector:triggerSources'],
  lower(clause, ctx) {
    if (!ctx.damageBatchTrigger) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'tap', objects: { kind: 'triggerSources' } }],
      rule: clause.rule,
    };
  },
};

/** "Put a stun counter on each of them" (CR 122.1d): the engine's `addCounters` of `stun` on the `triggerSources` of a `combatDamageBatch` trigger. Refused in any other ability. */
const STUN_TRIGGER_SOURCES: Lowering<IrClause, Effects> = {
  head: 'stunTriggerSources',
  id: 'lower.stun-trigger-sources',
  needs: ['effect:addCounters', 'selector:triggerSources'],
  lower(clause, ctx) {
    if (!ctx.damageBatchTrigger) return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'addCounters', objects: { kind: 'triggerSources' }, counter: 'stun', count: 1 },
      ],
      rule: clause.rule,
    };
  },
};

export const DAMAGE_BATCH_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  TAP_TRIGGER_SOURCES,
  STUN_TRIGGER_SOURCES,
];
