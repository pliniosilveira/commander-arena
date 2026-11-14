// Hand-built IR for the binding and lowering tests: no phrase rule reads pronouns, "up to" or
// disjunctions yet, so the passes after reading are tested on IR written out here.
import type {
  IrAbility,
  IrArg,
  IrClause,
  IrFilter,
  IrNoun,
  IrNounList,
  Span,
} from '../src/convert/parser/index';

let cursor = 0;

/** A span that does not overlap the previous one, so nouns have distinct identities. */
export function span(): Span {
  const start = cursor;
  cursor += 10;
  return { start, end: start + 5 };
}

export function noun(
  det: IrNoun['det'],
  raw: string,
  filter: Partial<IrFilter> = {},
  extra: Partial<IrNoun> = {},
): IrNoun {
  return {
    kind: 'noun',
    det,
    filter: { raw, ...filter },
    upTo: false,
    plural: false,
    other: false,
    span: span(),
    rule: 'noun.test',
    ...extra,
  };
}

export const target = (types: string[], raw = `target ${types.join(' ')}`): IrNoun =>
  noun('target', raw, { zone: 'battlefield', types });

export const anaphor = (raw: string, extra: Partial<IrNoun> = {}): IrNoun =>
  noun('anaphor', raw, {}, extra);

export function clause(verb: string, args: Record<string, IrArg>): IrClause {
  return { kind: 'clause', verb, args, optional: false, span: span(), rule: 'effect.test' };
}

export function list(...items: IrNoun[]): IrNounList {
  return { kind: 'nounList', items, span: span(), rule: 'noun.list' };
}

/** A spell whose sentences are the given clause lists. */
export function spell(...sentences: IrClause[][]): Extract<IrAbility, { kind: 'spell' }> {
  const body = {
    kind: 'body' as const,
    span: span(),
    rule: 'body',
    sentences: sentences.map((clauses) => ({
      kind: 'sentence' as const,
      clauses,
      span: span(),
      rule: 'body.sentence',
    })),
  };
  return { kind: 'spell', body, span: body.span, rule: 'spell.effect' };
}

export function clausesOf(ability: IrAbility): IrClause[] {
  if (ability.kind !== 'spell' && ability.kind !== 'activated' && ability.kind !== 'triggered') {
    return [];
  }
  return ability.body.sentences.flatMap((s) => [...s.clauses]);
}
