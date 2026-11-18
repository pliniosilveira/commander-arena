/**
 * Lowering of "Search your library for a Forest card and a Plains card, put them onto the battlefield tapped, then shuffle." (issue 226, CR 701.23, 701.24): two engine searches of
 * one card each, the second one shuffling. A card that is both kinds can be found for either (the player picks which kind it fills, and a second card of the other kind is still
 * found), so the two searches find what one search for both would.
 */
import type { Effect, SearchDestination } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

export const SEARCH_PAIR: Lowering<IrClause, Effects> = {
  head: 'searchPair',
  id: 'lower.search-pair',
  needs: ['effect:search'],
  lower(clause, ctx) {
    const first = arg(clause, 'cards');
    const second = arg(clause, 'cards2');
    const places = arg(clause, 'destinations');
    const shuffle = arg(clause, 'shuffle');
    if (
      first?.kind !== 'noun' ||
      second?.kind !== 'noun' ||
      places?.kind !== 'destinations' ||
      shuffle?.kind !== 'flag' ||
      places.items.length !== 1
    ) {
      return failure(clause);
    }
    const place = places.items[0];
    if (place?.zone !== 'battlefield') return failure(clause);
    const missing = missingFeatures(['searchDestination:battlefield']);
    if (missing.length > 0) return { ok: false, needs: missing, at: place.span, rule: place.rule };
    const destinations: SearchDestination[] = [
      { zone: 'battlefield', ...(place.tapped === true ? { tapped: true } : {}), count: 1 },
    ];
    const out: Effect[] = [];
    for (const [noun, last] of [
      [first, false],
      [second, true],
    ] as const) {
      const { sharedLandType, ...single } = noun.filter;
      if (sharedLandType === true) return failure(clause);
      const filter = lowerFilter({ ...noun, filter: withoutZone(single) });
      if (!filter.ok) return filter;
      out.push({
        kind: 'search',
        player: { kind: 'you' },
        filter: filter.value,
        max: 1,
        destinations,
        reveal: false,
        shuffle: last && shuffle.value,
      });
    }
    ctx.searched = null;
    ctx.didSearch = true;
    return { ok: true, value: out, rule: clause.rule };
  },
};

export const SEARCH_PAIR_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [SEARCH_PAIR];
