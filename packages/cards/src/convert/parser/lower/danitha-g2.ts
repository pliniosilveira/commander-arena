/**
 * Lowering of group 2 of the Danitha deck (issue 26, D-1220 provisional): "Mill four cards. You may put a land card from among them into your hand." (Ainok Wayfarer,
 * Blanchwood Prowler, Airlift Chaplain, Cache Grab, Something Worth Saving, Town Greeter, Midnight Tilling): the engine's `moveToZone` to the hand of a `choose` selector over
 * the controller's graveyard, `fromMoved` (only the cards the mill before it put there) and `optional` ("you may"). The kind describes a card in a graveyard: the filter carries
 * the zone and the controller the selector needs.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const PUT_FROM_AMONG: Lowering<IrClause, Effects> = {
  head: 'putFromAmong',
  id: 'lower.put-from-among',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseAmongMoved'],
  // The sentence's "you may" and the rule's own are the same offer: the engine asks once, a choice of none or one card (CR 608.2d).
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    // "Them" is the cards of the mill right before: after any other instruction it names something this lowering does not know (CR 608.2c).
    if (objects?.kind !== 'noun' || !ctx.milled) return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const may = arg(clause, 'may');
    const optional = clause.optional || (may?.kind === 'flag' && may.value);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'graveyard', controller: 'you' },
            ...(optional ? { optional: true as const } : {}),
            fromMoved: true,
          },
          to: 'hand',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const DANITHA_G2_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PUT_FROM_AMONG];
