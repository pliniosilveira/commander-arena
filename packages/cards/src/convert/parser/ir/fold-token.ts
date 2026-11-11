/**
 * "Create a 0/1 colorless Eldrazi Spawn creature token. It has \"Sacrifice ~: Add {C}.\"" (stage P35, D-176, CR 111.4, 608.2c): the sentence that
 * says what the token just created has is part of the description of that token. It is folded into the `createToken` clause of the sentence
 * before it, which must be that one instruction and nothing else, a token described by the text and not a copy of a permanent; the sentence is
 * then gone, so everything after the binding pass sees the token with its ability (an "optional" sentence, a count). Where nothing fits, the
 * sentence stays and no lowering reads it.
 */
import type { IrClause, IrSentence } from './types';

export function foldTokenAbilities(sentences: readonly IrSentence[]): readonly IrSentence[] {
  const out: IrSentence[] = [];
  for (const sentence of sentences) {
    const [clause, ...more] = sentence.clauses;
    const before = out[out.length - 1];
    const [create, ...others] = before?.clauses ?? [];
    const ability = clause?.args.ability;
    const token = create?.args.token;
    if (
      clause?.verb === 'hasAbility' &&
      ability?.kind === 'quoted' &&
      more.length === 0 &&
      sentence.condition === undefined &&
      !clause.optional &&
      clause.condition === undefined &&
      create?.verb === 'createToken' &&
      token?.kind === 'token' &&
      token.copyOf === undefined &&
      token.predefined === undefined &&
      create.args.alternative === undefined &&
      others.length === 0 &&
      before !== undefined
    ) {
      const folded: IrClause = {
        ...create,
        args: {
          ...create.args,
          token: { ...token, abilities: [...(token.abilities ?? []), ability] },
        },
      };
      out[out.length - 1] = { ...before, clauses: [folded] };
      continue;
    }
    out.push(sentence);
  }
  return out;
}
