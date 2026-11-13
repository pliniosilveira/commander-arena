/**
 * Lowering of group 5 of the Hashaton deck (D-1163, provisional number): "for each token you control of the chosen type that entered this turn, create a token that's a copy of it"
 * (CR 707.2, 111.4): the engine's `createCopies` of the group, with no exception.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { objectSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * A token for each token of the group, with its copiable values (CR 707.2). A token that is an Aura would ask a question the copy has no step for; "of the chosen type" is a
 * creature type, which an Aura does not have (the engine's `validateCard` refuses a group with no such limit that could be one).
 */
const CREATE_COPIES_OF_TOKENS: Lowering<IrClause, Effects> = {
  head: 'createCopiesOfTokens',
  id: 'lower.create-copies-of-tokens',
  needs: ['effect:createCopies'],
  lower: (clause, ctx) => {
    const group = operand(clause, 'objects');
    if (group?.kind !== 'noun' || group.det !== 'each') return failure(clause);
    const objects = objectSelectorOf(group, ctx);
    if (!objects.ok) return objects;
    return {
      ok: true,
      value: [{ kind: 'createCopies', objects: objects.value }],
      rule: clause.rule,
    };
  },
};

export const HASHATON_G5_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CREATE_COPIES_OF_TOKENS,
];
