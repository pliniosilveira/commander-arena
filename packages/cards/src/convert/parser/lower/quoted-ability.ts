/** Lower an activated or triggered ability granted to a permanent (CR 613.1f). */
import type { Ability } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrAbility, IrQuotedAbility } from '../ir/types';
import type { FeatureRef } from './features';
import { lateLowerers } from './late';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };
type Granted = Extract<Ability, { kind: 'activated' | 'triggered' }>;

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** Read a quoted ability as an ability of the creature that receives it. */
export function lowerQuotedGrantedAbility(
  quoted: IrQuotedAbility,
  at: At,
  ctx: LowerContext,
  sourceTypes: readonly string[] = ['creature'],
): LowerResult<Granted> {
  const inner: IrAbility = quoted.ability;
  if (inner.kind !== 'activated' && inner.kind !== 'triggered') return failure(at);
  const bound = bind(inner, {});
  if (!bound.ok) return failure(at);
  const own = newContext('ability', sourceTypes, ctx.faceSubtypes, ctx.cardName);
  const lowerers = lateLowerers();
  if (lowerers === null) return failure(at);
  const lowered =
    bound.ability.kind === 'triggered'
      ? lowerers.triggered(bound.ability, own)
      : bound.ability.kind === 'activated'
        ? lowerers.activated(bound.ability, own)
        : null;
  if (lowered === null) return failure(at);
  if (!lowered.ok) return failure(at, lowered.needs);
  const [only, ...more] = lowered.value;
  if (only === undefined || more.length > 0) return failure(at);
  return only.kind === 'activated' || only.kind === 'triggered'
    ? { ok: true, value: only, rule: at.rule }
    : failure(at);
}
