/**
 * Lowerings of group E of the Counter Blitz deck (Scholar of New Horizons). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { lowerAmount } from './amounts';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Search your library for a Plains card and reveal it. If an opponent controls more lands than you, you may put that card onto the battlefield tapped. If you don't put the card onto
 * the battlefield, put it into your hand. Then shuffle." (CR 701.23, 701.20, 608.2c, 608.2d, 701.24): the engine's `search` of one card, revealed, into the hand, with `mayPut` of the
 * condition (the opponents with more of the stat, at least one) and the shuffle.
 */
const SEARCH_MAY_PUT: Lowering<IrClause, Effects> = {
  head: 'searchMayPut',
  id: 'lower.search-may-put',
  needs: ['effect:search', 'selector:searchMayPut', 'searchDestination:hand', 'condition:amountIs'],
  lower(clause, ctx) {
    const cards = arg(clause, 'cards');
    const more = arg(clause, 'opponentsMore');
    const tapped = arg(clause, 'tapped');
    if (cards?.kind !== 'noun' || tapped?.kind !== 'flag' || more === undefined) {
      return failure(clause);
    }
    if (more.kind !== 'opponentsWithMore') return failure(clause);
    const { sharedLandType, anyNumberTotalManaValue, anyNumber, manaValueAtMostX, ...single } =
      cards.filter;
    if (
      sharedLandType !== undefined ||
      anyNumberTotalManaValue !== undefined ||
      anyNumber !== undefined ||
      manaValueAtMostX !== undefined ||
      cards.count !== undefined
    ) {
      return failure(clause);
    }
    const filter = lowerFilter({ ...cards, filter: withoutZone(single) });
    if (!filter.ok) return filter;
    const amount = lowerAmount(more, ctx, clause.rule);
    if (!amount.ok) return amount;
    const missing = missingFeatures(['selector:searchMayPut']);
    if (missing.length > 0)
      return { ok: false, needs: missing, at: clause.span, rule: clause.rule };
    // D-178: the card found is "it" and "that card" for what follows.
    ctx.searched = cards.ref ?? null;
    ctx.didSearch = true;
    const effect: Effect = {
      kind: 'search',
      player: { kind: 'you' },
      filter: filter.value,
      max: 1,
      destinations: [{ zone: 'hand', count: 1 }],
      mayPut: {
        condition: {
          kind: 'amountIs',
          amount: amount.value,
          compare: { cmp: 'atLeast', value: 1 },
        },
        ...(tapped.value ? { tapped: true as const } : {}),
      },
      reveal: true,
      shuffle: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const COUNTER_BLITZ_E_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [SEARCH_MAY_PUT];
