/**
 * What the static rules of stage P33 (D-149, D-150) build a statement from: the subject noun (`~`, "you" or "creatures") and the statement
 * of one or more effects, over the span a rule read.
 */
import type { IrNoun, IrStatic, IrStaticEffect, Span } from '../../ir/types';

/** `~`, or "you", as the subject of a statement: the noun the lowering and the diagnostics see. */
export function subjectNoun(
  det: 'self' | 'you' | 'each',
  raw: string,
  span: Span,
  rule: string,
): IrNoun {
  return {
    kind: 'noun',
    det,
    filter: { raw, ...(det === 'each' ? { types: ['creature'] } : {}) },
    upTo: false,
    plural: det === 'each',
    other: false,
    span,
    rule,
  };
}

export function staticOf(
  rule: string,
  subject: IrNoun,
  effects: readonly IrStaticEffect[],
  start: number,
  end: number,
): IrStatic {
  return { kind: 'static', subject, effects, span: { start, end }, rule };
}
