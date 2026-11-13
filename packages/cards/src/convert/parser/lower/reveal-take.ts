/**
 * Lowering of "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard."
 * (Commune with the Gods, Satyr Wayfinder, Vessel of Nascency, Malevolent Rumble; D-396, CR 701.20a): the engine's `lookAtTop` with `revealAll`, the controller's own library,
 * one card of the kind at most, put into the hand, the rest into the graveyard. The kind describes a card in a library: no zone or controller.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const REVEAL_TAKE: Lowering<IrClause, Effects> = {
  head: 'revealTake',
  id: 'lower.reveal-take',
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
          revealAll: true,
          take: { filter: filter.value, max: 1 },
          rest: 'graveyard',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const REVEAL_TAKE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_TAKE];
