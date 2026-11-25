/**
 * Lowering of "Exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order."
 * (Venture Forth, CR 701.13, 401.4, 110.2a): the engine's `exileUntilFound` of the controller's library with `then`.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

export const EXILE_UNTIL_PUT_REST_BOTTOM: Lowering<IrClause, Effects> = {
  head: 'exileUntilPutRestBottom',
  id: 'lower.exile-until-put-rest-bottom',
  needs: ['effect:exileUntilFound'],
  lower(clause) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'exileUntilFound',
          players: { kind: 'you' },
          filter: filter.value,
          then: { found: 'battlefield', rest: 'bottomRandom' },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EXILE_UNTIL_PUT_REST_BOTTOM_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_UNTIL_PUT_REST_BOTTOM,
];
