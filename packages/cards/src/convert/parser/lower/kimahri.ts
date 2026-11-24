/**
 * "Have ~ become a copy of that creature, except its name is ~ and it has vigilance and this ability" (Kimahri, Valiant Guardian; CR 707.2, 707.9a, 707.9b): the engine's `becomeCopy`
 * of this permanent, of the creature an earlier instruction named, for good, keeping its name, with a keyword and the resolving ability among the copiable values.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { arg, type Effects, failure, operand } from './clauses';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

const BECOME_COPY_KEEPING_ABILITY: Lowering<IrClause, Effects> = {
  head: 'becomeCopyKeepingAbility',
  id: 'lower.become-copy-keeping-ability',
  needs: ['effect:becomeCopy', 'effect:may', 'selector:target'],
  // "Then you may have ~ become a copy ...": the offer is the engine's `may` of the copy.
  acceptsOptional: true,
  lower(clause, ctx) {
    const of = operand(clause, 'of');
    const word = arg(clause, 'keyword');
    if (
      of?.kind !== 'noun' ||
      word?.kind !== 'keywordName' ||
      word.protection !== undefined ||
      clause.args.keepName?.kind !== 'flag' ||
      clause.args.thisAbility?.kind !== 'flag' ||
      ctx.owner !== 'ability'
    ) {
      return failure(clause);
    }
    const kind = keywordKind(word.name);
    if (kind === undefined) return failure(clause);
    const source = objectRefOf(of, ctx);
    if (!source.ok) return source;
    if (source.value.kind !== 'target') return failure(clause);
    const copy: Effect = {
      kind: 'becomeCopy',
      objects: { kind: 'this' },
      of: source.value,
      duration: 'permanent',
      keepName: true,
      abilities: [{ kind: 'keyword', keyword: plainKeyword(kind) }],
      withThisAbility: true,
    };
    return {
      ok: true,
      value: [clause.optional ? { kind: 'may', effect: copy } : copy],
      rule: clause.rule,
    };
  },
};

export const KIMAHRI_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  BECOME_COPY_KEEPING_ABILITY,
];
