/**
 * Clause lowerings of stage P2: "gets +N/+N until end of turn" and library search. Same contract
 * as effects.ts: each declares the engine features it needs, and is checked before it runs.
 */
import type { PlayerSelector, SearchDestination } from '@commander-arena/engine';
import { type IrClause, isIrAmount } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { lowerCountedPtStep, lowerPtTerm } from './amounts';
import { arg, type Effects, eachObject, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "~ gets +1/+1 until end of turn" (CR 611.2a, 613.4c): a continuous effect on the objects the
 * noun names as the effect resolves (CR 611.2c). The only duration the engine runs is "until end
 * of turn" (`duration:untilEndOfTurn`), which the clause must state.
 */
export const PUMP: Lowering<IrClause, Effects> = {
  head: 'modifyPt',
  id: 'lower.pump',
  needs: ['effect:modifyPt', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const pt = arg(clause, 'pt');
    if (pt?.kind !== 'ptChange' || clause.duration?.scope !== 'untilEndOfTurn') {
      return failure(clause);
    }
    // "-1/-1 until end of turn for each Swamp you control" (stage P28, D-131): the count, once, as the effect resolves
    // (CR 611.2c), times the step of each stat.
    const each = arg(clause, 'count');
    const counted = each !== undefined && isIrAmount(each) ? each : undefined;
    if (each !== undefined && counted === undefined) return failure(clause);
    // "+X/+0", "-X/-X" (stage P20, D-115): the X announced, once, as the effect resolves.
    const power =
      counted === undefined
        ? lowerPtTerm(pt.power, pt.span, ctx, pt.rule)
        : lowerCountedPtStep(pt.power, counted, ctx, pt.rule);
    if (!power.ok) return power;
    const toughness =
      counted === undefined
        ? lowerPtTerm(pt.toughness, pt.span, ctx, pt.rule)
        : lowerCountedPtStep(pt.toughness, counted, ctx, pt.rule);
    if (!toughness.ok) return toughness;
    return eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'modifyPt',
        objects,
        power: power.value,
        toughness: toughness.value,
        duration: 'untilEndOfTurn',
      }),
      'objects',
      { triggerSubject: true },
    );
  },
};

/**
 * "Search your library for ..." (CR 701.23): the searcher is you, or the player the clause names
 * ("Its controller may search their library ...": `player` and a `may` flag, CR 701.23a, 608.2d),
 * the filter is the noun
 * without its zone (the engine looks in the searcher's own library), and the cards found go to the
 * destinations in the order they were chosen. The counts must add up to the most cards that can
 * be found (the engine's check), which the rule's reading guarantees.
 */
export const SEARCH: Lowering<IrClause, Effects> = {
  head: 'search',
  id: 'lower.search',
  needs: ['effect:search'],
  lower(clause, ctx) {
    const cards = arg(clause, 'cards');
    const places = arg(clause, 'destinations');
    const reveal = arg(clause, 'reveal');
    const shuffle = arg(clause, 'shuffle');
    if (
      cards?.kind !== 'noun' ||
      places?.kind !== 'destinations' ||
      reveal?.kind !== 'flag' ||
      shuffle?.kind !== 'flag'
    ) {
      return failure(clause);
    }
    // The IR says where the cards are (the library); the engine's filter must not (CR 401.1). "That share a land type" (D-258, CR 205.3i) is about the cards found
    // together, so it is an option of the search and not of the filter: the engine's `search.sharedLandType`.
    const { sharedLandType, ...single } = cards.filter;
    const shared = sharedLandType === true;
    const sharing = shared ? missingFeatures(['selector:sharedLandType']) : [];
    if (sharing.length > 0) return { ok: false, needs: sharing, at: cards.span, rule: cards.rule };
    const filter = lowerFilter({ ...cards, filter: withoutZone(single) });
    if (!filter.ok) return filter;
    const max = cards.count?.kind === 'number' ? cards.count.value : 1;
    const destinations: SearchDestination[] = [];
    for (const place of places.items) {
      if (place.zone !== 'battlefield' && place.zone !== 'hand' && place.zone !== 'graveyard') {
        const needs = missingFeatures([`searchDestination:${place.zone}`]);
        return { ok: false, needs, at: place.span, rule: place.rule };
      }
      const missing = missingFeatures([`searchDestination:${place.zone}`]);
      if (missing.length > 0)
        return { ok: false, needs: missing, at: place.span, rule: place.rule };
      destinations.push({
        zone: place.zone,
        ...(place.tapped === true ? { tapped: true } : {}),
        count: place.count ?? max,
      });
    }
    // D-178: the cards that were found are "it" and "that land" for what follows (the engine's `moved`).
    ctx.searched = cards.ref ?? null;
    const total = destinations.reduce((sum, d) => sum + (d.count === 'rest' ? 0 : d.count), 0);
    if (total !== max) return failure(clause);
    // Another player searches their own library, and a "may" is theirs to answer (CR 608.2d).
    const who = arg(clause, 'player');
    const may = arg(clause, 'may');
    if ((who === undefined) !== (may === undefined)) return failure(clause);
    let player: PlayerSelector = { kind: 'you' };
    if (who !== undefined) {
      if (who.kind !== 'noun' || may?.kind !== 'flag' || !may.value) return failure(clause);
      const selector = playerSelectorOf(who, ctx);
      if (!selector.ok) return selector;
      player = selector.value;
    }
    return {
      ok: true,
      value: [
        {
          kind: 'search',
          player,
          ...(who === undefined ? {} : { optional: true as const }),
          filter: filter.value,
          max,
          ...(shared ? { sharedLandType: true as const } : {}),
          destinations,
          reveal: reveal.value,
          shuffle: shuffle.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

/** The `searchDestination:` features the search lowering can name, for the dimension test. */
export const SEARCH_NEEDS = [
  'searchDestination:battlefield',
  'searchDestination:hand',
  'searchDestination:graveyard',
  'searchDestination:library',
  'searchDestination:exile',
] as const;
