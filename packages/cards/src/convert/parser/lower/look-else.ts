/**
 * Lowering of "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your
 * hand. Put the rest on the bottom of your library in a random order." (Planar Genesis, CR 608.2c, 608.2d): the engine's `lookAtTop` of the controller's own library, one card of
 * the kind at most put onto the battlefield tapped without being revealed, `take.elseAnyToHand` for the card of any kind that goes to the hand when none was taken, the rest on
 * the bottom in a random order. The kind describes a card in a library: no zone or controller.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const LOOK_TAKE_ELSE_HAND: Lowering<IrClause, Effects> = {
  head: 'lookTakeElseHand',
  id: 'lower.look-take-else-hand',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const take = arg(clause, 'take');
    if (take?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(take);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: {
            filter: filter.value,
            max: 1,
            to: 'battlefield',
            tapped: true,
            hidden: true,
            elseAnyToHand: true,
          },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const LOOK_ELSE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [LOOK_TAKE_ELSE_HAND];
