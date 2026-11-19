/**
 * Lowerings of the Death Toll deck, group C (Mulch, Wrenn and Seven, Professor Onyx, Ob Nixilis Reignited, Grist the Hunger Tide). Same contract as effects.ts: each declares the
 * engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard." (Mulch, CR 701.20a, 608.2c): the engine's
 * `lookAtTop` of a reveal (`revealAll`) that takes every card of the kind (`take.all`) into the hand, the rest into the graveyard.
 */
const REVEAL_PUT_ALL_HAND: Lowering<IrClause, Effects> = {
  head: 'revealPutAllHand',
  id: 'lower.reveal-put-all-hand',
  needs: ['effect:lookAtTop', 'ability:lookTakeAll'],
  lower(clause, ctx) {
    const card = arg(clause, 'card');
    if (card?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          revealAll: true,
          take: { filter: filter.value, max: 1, to: 'hand', all: true },
          rest: 'graveyard',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard." (Professor Onyx, CR 401.2, 701.20a): the engine's `lookAtTop`,
 * exactly one card of any kind into the hand without being revealed, the rest into the graveyard.
 */
const LOOK_TAKE_ONE_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'lookTakeOneGraveyard',
  id: 'lower.look-take-one-graveyard',
  needs: ['effect:lookAtTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: 1, min: 1, hidden: true },
          rest: 'graveyard',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Put any number of land cards from your hand onto the battlefield tapped." (Wrenn and Seven, CR 608.2d, 110.2a): the engine's `moveToZone` of a `choose` selector of the cards of the
 * kind in the controller's hand, optional, with as many as the hand holds of that kind as the most (the amount is read as the effect runs); they enter under their control.
 */
const PUT_ANY_NUMBER_FROM_HAND: Lowering<IrClause, Effects> = {
  head: 'putAnyNumberFromHand',
  id: 'lower.put-any-number-from-hand',
  needs: ['effect:moveToZone', 'selector:choose', 'amount:countOf'],
  lower(clause) {
    const card = arg(clause, 'card');
    const tapped = arg(clause, 'tapped');
    if (card?.kind !== 'noun' || tapped?.kind !== 'flag') return failure(clause);
    const filter = lowerFilter(card);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: filter.value,
            count: { kind: 'countOf', filter: filter.value },
            optional: true,
          },
          to: 'battlefield',
          ...(tapped.value ? { tapped: true } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const DEATH_TOLL_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_PUT_ALL_HAND,
  LOOK_TAKE_ONE_GRAVEYARD,
  PUT_ANY_NUMBER_FROM_HAND,
];
