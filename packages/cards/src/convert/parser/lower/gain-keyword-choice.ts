/**
 * Lowering of "Target creature gains your choice of lifelink or indestructible until end of turn." (Orcish Medicine, CR 608.2d, 611.2a, 613.1f): the engine's `chooseOne`, one option for
 * each keyword, whose effect is the same `grantKeyword` of the same object as "gains lifelink until end of turn" lowers to. The choice is the controller's, as the effect resolves.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import { GRANT_KEYWORD } from './continuous';
import type { Lowering } from './types';

const GAIN_KEYWORD_CHOICE: Lowering<IrClause, Effects> = {
  head: 'grantKeywordChoice',
  id: 'lower.gain-keyword-choice',
  needs: ['effect:chooseOne', ...GRANT_KEYWORD.needs],
  takesDuration: true,
  lower(clause, ctx) {
    const list = clause.args.keywords;
    const objects = clause.args.objects;
    if (list?.kind !== 'keywordList' || objects === undefined) return failure(clause);
    const options: { label: string; effect: Effect }[] = [];
    for (const name of list.names) {
      // Each option is lowered as the one-keyword sentence would be, so what the engine can grant and what each needs is checked as it is for that sentence.
      const single = GRANT_KEYWORD.lower(
        {
          ...clause,
          args: {
            objects,
            keyword: { kind: 'keywordName', name, span: list.span, rule: list.rule },
          },
        },
        ctx,
      );
      if (!single.ok) return single;
      const [only, ...more] = single.value;
      if (only === undefined || more.length > 0) return failure(clause);
      options.push({ label: name, effect: only });
    }
    return { ok: true, value: [{ kind: 'chooseOne', options }], rule: clause.rule };
  },
};

export const GAIN_KEYWORD_CHOICE_LOWERINGS = [GAIN_KEYWORD_CHOICE];
