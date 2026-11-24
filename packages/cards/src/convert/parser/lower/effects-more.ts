/**
 * Clause lowerings of stage P2: "gets +N/+N until end of turn" and library search. Same contract
 * as effects.ts: each declares the engine features it needs, and is checked before it runs.
 */
import type { Amount, PlayerSelector, SearchDestination } from '@commander-arena/engine';
import { type IrClause, isIrAmount } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { lowerAmount, lowerCountedPtStep, lowerPtTerm } from './amounts';
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
 * ("Its controller may search their library ...": `player` and a `may` flag, CR 701.23a, 608.2d; "Each player searches their library ..." has the flag false),
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
    // The IR says where the cards are (the library); the engine's filter must not (CR 401.1). "That share a land type" (D-262, CR 205.3i) is about the cards found
    // together, so it is an option of the search and not of the filter: the engine's `search.sharedLandType`.
    const {
      sharedLandType,
      anyNumberTotalManaValue: totalMV,
      anyNumber,
      manaValueAtMostX: atMostX,
      ...single
    } = cards.filter;
    const shared = sharedLandType === true;
    const sharing = shared ? missingFeatures(['selector:sharedLandType']) : [];
    if (sharing.length > 0) return { ok: false, needs: sharing, at: cards.span, rule: cards.rule };
    // CR 701.23, 202.3: "any number of ... cards with total mana value N or less": every card found goes to the one place, as for "up to X".
    const totaling =
      totalMV === undefined ? [] : missingFeatures(['selector:searchTotalManaValue']);
    if (totaling.length > 0)
      return { ok: false, needs: totaling, at: cards.span, rule: cards.rule };
    // CR 701.23: "any number of ... cards": every card found goes to the one place, as for the total mana value.
    const counting = anyNumber === true ? missingFeatures(['selector:searchAnyNumber']) : [];
    if (counting.length > 0)
      return { ok: false, needs: counting, at: cards.span, rule: cards.rule };
    const filter = lowerFilter({ ...cards, filter: withoutZone(single) });
    if (!filter.ok) return filter;
    // "a creature card with mana value X or less" (Finale of Devastation, CR 107.3a, 202.3): the X announced for the spell, so only the text of a spell with an X of its own
    // reads it; a card in a library or a graveyard counts an {X} in its own cost as 0 (CR 202.3e).
    let limit: Amount | undefined;
    if (atMostX === true) {
      if (ctx.owner !== 'spell' || ctx.xIs !== null || totalMV !== undefined) {
        return failure(clause);
      }
      const missing = missingFeatures(['selector:manaValueAtMost']);
      if (missing.length > 0)
        return { ok: false, needs: missing, at: cards.span, rule: cards.rule };
      const amount = lowerAmount({ kind: 'x', span: cards.span }, ctx, clause.rule);
      if (!amount.ok) return amount;
      limit = amount.value;
    }
    // D-626: "up to X ..., where X is ...": the amount is the most that may be found, read as the search begins; the cards all go to one place.
    const xCount = cards.count?.kind === 'x';
    const maxAmount = arg(clause, 'maxAmount');
    if (xCount !== (maxAmount !== undefined)) return failure(clause);
    let amountValue: Amount | null = null;
    if (maxAmount !== undefined) {
      if (!isIrAmount(maxAmount)) return failure(clause);
      const lowered = lowerAmount(maxAmount, ctx, clause.rule);
      if (!lowered.ok) return lowered;
      amountValue = lowered.value;
    }
    const anyOf = anyNumber === true;
    const rest = xCount || totalMV !== undefined || anyOf;
    if (
      (totalMV !== undefined || anyOf) &&
      (shared || xCount || cards.count !== undefined || (totalMV !== undefined && anyOf))
    ) {
      return failure(clause);
    }
    const max = rest ? 1 : cards.count?.kind === 'number' ? cards.count.value : 1;
    // Issue 104 (CR 701.23a): "search your graveyard, hand, and/or library": the zones of the searcher, with nothing revealed and no shuffle in the sentence.
    const zonesArg = arg(clause, 'zones');
    let zones: readonly ('graveyard' | 'hand' | 'library')[] | undefined;
    if (zonesArg !== undefined) {
      if (zonesArg.kind !== 'destinations' || reveal.value || shuffle.value) return failure(clause);
      const needs = missingFeatures(['selector:searchZones']);
      if (needs.length > 0) return { ok: false, needs, at: zonesArg.span, rule: zonesArg.rule };
      const names: ('graveyard' | 'hand' | 'library')[] = [];
      for (const item of zonesArg.items) {
        if (item.zone !== 'graveyard' && item.zone !== 'hand' && item.zone !== 'library') {
          return failure(clause);
        }
        names.push(item.zone);
      }
      zones = names;
    }
    const destinations: SearchDestination[] = [];
    for (const place of places.items) {
      if (
        place.zone !== 'battlefield' &&
        place.zone !== 'hand' &&
        place.zone !== 'graveyard' &&
        place.zone !== 'library'
      ) {
        const needs = missingFeatures([`searchDestination:${place.zone}`]);
        return { ok: false, needs, at: place.span, rule: place.rule };
      }
      const missing = missingFeatures([`searchDestination:${place.zone}`]);
      if (missing.length > 0)
        return { ok: false, needs: missing, at: place.span, rule: place.rule };
      destinations.push({
        zone: place.zone,
        ...(place.tapped === true ? { tapped: true } : {}),
        count: rest ? 'rest' : (place.count ?? max),
      });
    }
    if (rest && destinations.length !== 1) return failure(clause);
    // D-178: the cards that were found are "it" and "that land" for what follows (the engine's `moved`).
    ctx.searched = cards.ref ?? null;
    ctx.didSearch = true;
    const total = destinations.reduce((sum, d) => sum + (d.count === 'rest' ? 0 : d.count), 0);
    if (!rest && total !== max) return failure(clause);
    // Another player searches their own library, and a "may" is theirs to answer (CR 608.2d).
    const who = arg(clause, 'player');
    const may = arg(clause, 'may');
    if ((who === undefined) !== (may === undefined)) return failure(clause);
    let player: PlayerSelector = { kind: 'you' };
    if (who !== undefined) {
      if (who.kind !== 'noun' || may?.kind !== 'flag') return failure(clause);
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
          // A "may" is the searching player's to answer; "each player searches" (Field of Ruin) is not one (`may` false).
          ...(who === undefined || may?.kind !== 'flag' || !may.value
            ? {}
            : { optional: true as const }),
          filter: limit === undefined ? filter.value : { ...filter.value, manaValueAtMost: limit },
          max,
          ...(amountValue === null ? {} : { maxAmount: amountValue }),
          ...(totalMV === undefined ? {} : { totalManaValue: totalMV }),
          ...(anyOf ? { anyNumber: true as const } : {}),
          ...(shared ? { sharedLandType: true as const } : {}),
          ...(zones === undefined ? {} : { zones }),
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
