/**
 * What the clause lowerings share: the failure of a clause, argument readers, and the "one effect
 * per operand" loop. Split from effects.ts so the lowerings of later stages can use them without
 * importing each other.
 */
import type { Effect, ObjectSelector } from '@commander-arena/engine';
import { type IrClause, type IrNoun, type IrNounList, isIrAmount } from '../ir/types';
import { lowerAmount } from './amounts';
import type { FeatureRef } from './features';
import { itemsOf, objectSelectorOf, type RefOptions } from './nouns';
import type { LowerContext, LowerFailure, LowerResult } from './types';

export type Effects = readonly Effect[];

export function failure(clause: IrClause, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: clause.span, rule: clause.rule };
}

export function arg<K extends string>(clause: IrClause, name: K) {
  return clause.args[name];
}

export function operand(clause: IrClause, name: string): IrNoun | IrNounList | undefined {
  const a = arg(clause, name);
  return a?.kind === 'noun' || a?.kind === 'nounList' ? a : undefined;
}

export function amountArg(clause: IrClause, name: string, ctx: LowerContext) {
  const a = arg(clause, name);
  if (a === undefined) return failure(clause);
  return isIrAmount(a) ? lowerAmount(a, ctx, clause.rule) : failure(clause);
}

/**
 * One effect per operand, in text order (the S1 reading of "Destroy A, B, and C"). With `triggerSubject` an operand
 * may be "it", the permanent whose event caused the trigger (D-133, stage P29): only the effects that read it say so.
 */
export function eachObject(
  clause: IrClause,
  ctx: LowerContext,
  build: (objects: ObjectSelector) => Effect,
  name = 'objects',
  options: RefOptions = {},
): LowerResult<Effects> {
  const target = operand(clause, name);
  if (target === undefined) return failure(clause);
  const effects: Effect[] = [];
  for (const item of itemsOf(target)) {
    const selector = objectSelectorOf(item, ctx, options);
    if (!selector.ok) return selector;
    effects.push(build(selector.value));
  }
  return { ok: true, value: effects, rule: clause.rule };
}
