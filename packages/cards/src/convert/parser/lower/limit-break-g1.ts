/**
 * Lowerings of the Limit Break deck, group 1 (Zack Fair; CR 113.7a, 122.1, 301.5, 608.2h, 701.3): what the permanent sacrificed to pay the cost of its own ability hands on to a creature
 * an earlier instruction named: the engine's `putCountersOf` (its counters, as it last was) and a `chooseObjects` of the objects that were `attachedTo` it, then `attach`. Read only in an
 * activated ability whose cost sacrifices `~` (the permanent is gone when the effect runs).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import { missingFeatures } from './features';
import { objectRefOf } from './nouns';
import type { LowerContext, Lowering } from './types';

/** An ability whose own cost sacrificed `~`: the permanent is only last-known information when the effect runs. */
const sacrificedSelf = (ctx: LowerContext): boolean => ctx.owner === 'ability' && ctx.selfGone;

/** The creature the clause names as "that creature": a target an earlier instruction of the ability chose. */
function destination(clause: IrClause, ctx: LowerContext) {
  const to = arg(clause, 'to');
  if (to?.kind !== 'noun') return failure(clause);
  const ref = objectRefOf(to, ctx);
  if (!ref.ok) return ref;
  return ref.value.kind === 'target' ? ref : failure(clause);
}

const PUT_COUNTERS_OF: Lowering<IrClause, Effects> = {
  head: 'putCountersOf',
  id: 'lower.put-counters-of',
  needs: ['effect:putCountersOf', 'selector:target'],
  lower(clause, ctx) {
    const from = arg(clause, 'from');
    if (from?.kind !== 'noun' || from.det !== 'self' || !sacrificedSelf(ctx)) {
      return failure(clause);
    }
    const to = destination(clause, ctx);
    if (!to.ok) return to;
    const effect: Effect = { kind: 'putCountersOf', from: { kind: 'this' }, to: to.value };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** The id of the Equipment the controller picks among those that were attached to the sacrificed permanent. */
const WAS_ATTACHED = 'wasAttached';

const ATTACH_WAS_ATTACHED: Lowering<IrClause, Effects> = {
  head: 'attachWasAttached',
  id: 'lower.attach-was-attached',
  needs: ['effect:chooseObjects', 'effect:attach', 'selector:chosen', 'selector:target'],
  lower(clause, ctx) {
    const from = arg(clause, 'from');
    if (from?.kind !== 'noun' || from.det !== 'self' || !sacrificedSelf(ctx)) {
      return failure(clause);
    }
    const blocked = missingFeatures(['selector:attachedToSacrificedCost']);
    if (blocked.length > 0) return failure(clause, blocked);
    const to = destination(clause, ctx);
    if (!to.ok) return to;
    const effects: Effect[] = [
      {
        kind: 'chooseObjects',
        id: WAS_ATTACHED,
        filter: { subtypes: ['Equipment'], attachedTo: { kind: 'sacrificedCost' } },
        count: 1,
        exactly: true,
      },
      { kind: 'attach', object: { kind: 'chosen', id: WAS_ATTACHED }, to: to.value },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** The id of the Equipment the controller picks among their own. */
const OWN_EQUIPMENT = 'ownEquipment';

const ATTACH_OWN_TO_SELF: Lowering<IrClause, Effects> = {
  head: 'attachOwnToSelf',
  id: 'lower.attach-own-to-self',
  needs: ['effect:chooseObjects', 'effect:attach', 'selector:chosen'],
  // "You may attach an Equipment you control to ~": the choice of up to one Equipment is the offer, so the clause's own "may" is not wrapped around it again.
  acceptsOptional: true,
  lower(clause, ctx) {
    const to = arg(clause, 'to');
    if (to?.kind !== 'noun' || to.det !== 'self' || ctx.owner !== 'ability' || ctx.selfGone) {
      return failure(clause);
    }
    const effects: Effect[] = [
      {
        kind: 'chooseObjects',
        id: OWN_EQUIPMENT,
        filter: { zone: 'battlefield', subtypes: ['Equipment'], controller: 'you' },
        count: 1,
      },
      { kind: 'attach', object: { kind: 'chosen', id: OWN_EQUIPMENT }, to: { kind: 'this' } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const LIMIT_BREAK_G1_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_COUNTERS_OF,
  ATTACH_WAS_ATTACHED,
  ATTACH_OWN_TO_SELF,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const LIMIT_BREAK_G1_NEEDS: readonly FeatureRef[] = [
  'effect:putCountersOf',
  'effect:chooseObjects',
  'effect:attach',
  'selector:chosen',
  'selector:target',
  'selector:attachedToSacrificedCost',
];
