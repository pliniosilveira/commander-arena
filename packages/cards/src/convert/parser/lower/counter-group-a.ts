/**
 * Lowerings of the Final Fantasy X counter group (group A): Support (CR 701.41a), "put those counters on target permanent you control" (Resourceful Defense; CR 122.6, 603.10a, 113.7a),
 * "can't be blocked by creatures your opponents control" (Rikku, Resourceful Guardian; CR 509.1b) and "Choose target creature ... When that creature dies this turn, return that card to its
 * owner's hand" (Together Forever; CR 603.7, 603.7c, 603.10a).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import type { FeatureRef } from './features';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Support N" (CR 701.41a): "Put a +1/+1 counter on each of up to N other target creatures" on a permanent, "... up to N target creatures" on an instant or sorcery spell. The engine's
 * `addCounters` of one slot of up to N targets (`min` 0, `max` N); the permanent's "other" is the engine's filter `other`. "Support X" in the enters trigger of the permanent itself reads the
 * X of the spell it came from (the target slot's `upToAmount`, CR 107.3m).
 */
const SUPPORT: Lowering<IrClause, Effects> = {
  head: 'support',
  id: 'lower.support',
  needs: ['effect:addCounters', 'selector:target'],
  lower(clause, ctx) {
    const noun = operand(clause, 'objects');
    if (noun?.kind !== 'noun' || noun.det !== 'target') return failure(clause);
    // CR 701.41a: only a permanent's support leaves out the permanent itself ("other target creatures").
    const objects = ctx.owner === 'spell' ? { ...noun, other: false } : noun;
    const selector = objectSelectorOf(objects, ctx);
    if (!selector.ok) return selector;
    const effect: Effect = {
      kind: 'addCounters',
      objects: selector.value,
      counter: '+1/+1',
      count: 1,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Until end of turn, that creature can't be blocked by creatures your opponents control" (Rikku, Resourceful Guardian; CR 509.1b, 611.2a): the engine's `cantBeBlockedByPlayer` of each
 * opponent of the controller, as the effect resolves. "That creature" or "it" is the permanent the trigger is about.
 */
const CANT_BE_BLOCKED_BY_OPPONENTS: Lowering<IrClause, Effects> = {
  head: 'cantBeBlockedByOpponents',
  id: 'lower.cant-be-blocked-by-opponents',
  needs: ['effect:cantBeBlockedByPlayer', 'selector:eachOpponent', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const scope = clause.duration?.scope;
    if (scope !== 'thisTurn' && scope !== 'untilEndOfTurn') return failure(clause);
    const noun = operand(clause, 'objects');
    if (noun?.kind !== 'noun') return failure(clause);
    const objects = objectSelectorOf(noun, ctx, { triggerSubject: true });
    if (!objects.ok) return objects;
    const effect: Effect = {
      kind: 'cantBeBlockedByPlayer',
      objects: objects.value,
      player: { kind: 'eachOpponent' },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand." (Together Forever; CR 603.7, 603.7c, 603.10a): the creature is the
 * target of the ability, and the engine's `delayedDies` makes the delayed triggered ability that returns the card it became (`triggerCard`) to its owner's hand.
 */
const DELAYED_DIES: Lowering<IrClause, Effects> = {
  head: 'delayedDies',
  id: 'lower.delayed-dies',
  needs: ['effect:delayedDies', 'effect:moveToZone', 'selector:target', 'selector:triggerCard'],
  lower(clause, ctx) {
    const noun = operand(clause, 'objects');
    if (noun?.kind !== 'noun' || noun.det !== 'target') return failure(clause);
    const objects = objectSelectorOf(noun, ctx);
    if (!objects.ok) return objects;
    const effect: Effect = {
      kind: 'delayedDies',
      objects: objects.value,
      effect: { kind: 'moveToZone', objects: { kind: 'triggerCard' }, to: 'hand' },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const COUNTER_GROUP_A_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SUPPORT,
  CANT_BE_BLOCKED_BY_OPPONENTS,
  DELAYED_DIES,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNTER_GROUP_A_NEEDS: readonly FeatureRef[] = [
  'effect:addCounters',
  'effect:putCountersOf',
  'effect:cantBeBlockedByPlayer',
  'effect:delayedDies',
  'effect:moveToZone',
  'selector:target',
  'selector:triggerSubject',
  'selector:eachOpponent',
  'selector:triggerCard',
  'duration:untilEndOfTurn',
  'selector:upToAmount',
  'amount:enteredX',
];
