/**
 * Lowering of the quoted static ability of a copy's exception (Mocking Doppelganger: "You may have ~ enter as a copy of a creature an opponent controls, except it has \"Other creatures
 * with the same name as ~ are goaded.\"", CR 707.9a, 707.9b, 604.1). The quoted text was read as a static ability of its own (`rules/replacement/copy-except-quoted.ts`) and is bound and
 * lowered like the static ability of a card; the engine's `entersAsCopy.addStatics` makes each resulting ability part of the copiable values of the permanent that enters, so `~` in the
 * quotes is that permanent, whose name is the one it copies.
 */
import type { Ability } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrArg } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { lateLowerers } from './late';
import type { LowerContext, LowerFailure, LowerResult } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** The static abilities the quoted text gives the copy, or a failure at `at` when the engine does not run it as given. */
export function lowerQuotedCopyStatic(
  quoted: IrArg,
  at: At,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  if (quoted.kind !== 'quoted' || quoted.ability.kind !== 'static') return failure(at);
  const missing = missingFeatures(['ability:static']);
  if (missing.length > 0) return failure(at, missing);
  const bound = bind(quoted.ability, {});
  if (!bound.ok || bound.ability.kind !== 'static') return failure(at);
  const general = lateLowerers();
  if (general === null) return failure(at);
  const lowered = general.static(bound.ability, ctx);
  if (!lowered.ok) return failure(at, lowered.needs);
  if (ctx.usesX || lowered.value.length === 0) return failure(at);
  // Only a plain static ability: no condition and no zone of its own.
  for (const a of lowered.value) {
    if (a.kind !== 'static' || a.condition !== undefined || a.functionsIn !== undefined) {
      return failure(at);
    }
  }
  return { ok: true, value: lowered.value, rule: at.rule };
}
