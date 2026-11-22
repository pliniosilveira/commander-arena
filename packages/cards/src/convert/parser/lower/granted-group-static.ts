/**
 * Lowering of a static ability that gives a group "+N/+N" or keywords, given to a permanent by another static ability (Dancer's Chakrams: `Equipped creature has "Other commanders you
 * control get +2/+2 and have lifelink,"`; CR 604.1, 613.1f, 613.8). The quoted text was read as a static statement of its own (`rules/static/granted-group-static.ts`) and is bound and
 * lowered like the static ability of a card; the engine's `grantAbility` gives each resulting ability (one for the "+N/+N", one for each keyword) to the subject, which has it as its
 * own, so "other" and "you" are read against that permanent and its controller (`rules/granted-statics.ts`).
 */
import type { Ability, StaticEffect } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrAbility, IrQuotedAbility } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };
type Static = Extract<IrAbility, { kind: 'static' }>;
export type GroupStaticAbility = Extract<Ability, { kind: 'static' }> & {
  readonly static: Extract<StaticEffect, { kind: 'modifyPt' | 'grantKeyword' }>;
};

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** The abilities the quoted static ability gives to a group, or a failure at `at` when it is not one the engine runs as given. */
export function lowerGrantedGroupStatics(
  quoted: IrQuotedAbility,
  at: At,
  ctx: LowerContext,
  lowerStatic: (ability: Static, ctx: LowerContext) => LowerResult<readonly Ability[]>,
): LowerResult<readonly GroupStaticAbility[]> {
  const inner = quoted.ability;
  if (inner.kind !== 'static' || ctx.namedInQuotes) return failure(at);
  const missing = missingFeatures(['ability:static', 'static:grantAbility']);
  if (missing.length > 0) return failure(at, missing);
  const bound = bind(inner, {});
  if (!bound.ok || bound.ability.kind !== 'static') return failure(at);
  const own = newContext('ability', [], [], ctx.cardName);
  const lowered = lowerStatic(bound.ability, own);
  if (!lowered.ok) return failure(at, lowered.needs);
  if (own.usesX || lowered.value.length === 0) return failure(at);
  const out: GroupStaticAbility[] = [];
  for (const a of lowered.value) {
    if (
      a.kind !== 'static' ||
      (a.static.kind !== 'modifyPt' && a.static.kind !== 'grantKeyword') ||
      a.static.subject.kind !== 'filter' ||
      a.condition !== undefined ||
      a.functionsIn !== undefined
    ) {
      return failure(at);
    }
    out.push(a as GroupStaticAbility);
  }
  return { ok: true, value: out, rule: at.rule };
}
