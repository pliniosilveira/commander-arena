/**
 * Lowerings of the instructions that put cards from the top of the controller's library somewhere (Cavalier of Thorns, Cream of the Crop, Risen Reef): the engine's `lookAtTop`.
 * Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard." (CR 701.20a, 608.2c): a reveal (`revealAll`) of
 * the top `count` cards, one card of the kind (`min` 1: it must be put when one is there) onto the battlefield untapped, the rest into the graveyard.
 */
const REVEAL_PUT_ONE_BATTLEFIELD: Lowering<IrClause, Effects> = {
  head: 'revealPutOneBattlefield',
  id: 'lower.reveal-put-one-battlefield',
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
          take: { filter: filter.value, max: 1, min: 1, to: 'battlefield' },
          rest: 'graveyard',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest on the bottom of your library in
 * any order." (CR 401.2, 401.4): one card of the top `count` (any kind, unrevealed) stays on top, the rest go on the bottom in the order the owner chooses.
 */
const LOOK_TOP_X_ONE_ON_TOP: Lowering<IrClause, Effects> = {
  head: 'lookTopXOneOnTop',
  id: 'lower.look-top-x-one-on-top',
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
          take: { filter: {}, max: 1, min: 1, to: 'top', hidden: true },
          rest: 'bottomChosen',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand."
 * (CR 608.2c): one card looked at, put onto the battlefield tapped when it is of the kind and the player chooses, else into the hand, unrevealed (`take.elseAnyToHand`).
 */
const LOOK_TOP_ELSE_HAND: Lowering<IrClause, Effects> = {
  head: 'lookTopElseHand',
  id: 'lower.look-top-else-hand',
  needs: ['effect:lookAtTop'],
  lower(clause) {
    const take = arg(clause, 'take');
    if (take?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(take);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: 1,
          take: {
            filter: filter.value,
            max: 1,
            to: 'battlefield',
            tapped: true,
            hidden: true,
            elseAnyToHand: true,
          },
          rest: 'top',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped." (Explorer's Scope, CR 608.2c, 701.20a): one card looked at, put onto the
 * battlefield tapped when it is of the kind and the player chooses; otherwise it stays on top (`rest: 'top'`).
 */
const LOOK_TOP_MAY_BATTLEFIELD: Lowering<IrClause, Effects> = {
  head: 'lookTopMayBattlefield',
  id: 'lower.look-top-may-battlefield',
  needs: ['effect:lookAtTop'],
  lower(clause) {
    const take = arg(clause, 'take');
    if (take?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(take);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: 1,
          take: { filter: filter.value, max: 1, to: 'battlefield', tapped: true },
          rest: 'top',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const LIBRARY_TOP_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_PUT_ONE_BATTLEFIELD,
  LOOK_TOP_X_ONE_ON_TOP,
  LOOK_TOP_ELSE_HAND,
  LOOK_TOP_MAY_BATTLEFIELD,
];
