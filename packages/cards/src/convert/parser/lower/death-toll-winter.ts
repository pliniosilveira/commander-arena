/**
 * Lowering of the delirium ability of Winter, Cynical Opportunist (Death Toll deck): "You may exile any number of cards from your graveyard with four or more card types among them.
 * If you do, put a permanent card from among them onto the battlefield with a finality counter on it." The exile is the engine's `moveToZone` into exile of a `choose` selector over
 * the controller's graveyard with `anyNumber`, `optional` and `minCardTypes` (the cards chosen together have that many card types, CR 205.2a); the put is a `moveToZone` onto the
 * battlefield of a `choose` selector among the cards the exile moved (`fromMoved`, in exile), with the counter it enters with (CR 122.6).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const EXILE_GRAVEYARD_CARD_TYPES: Lowering<IrClause, Effects> = {
  head: 'exileGraveyardCardTypes',
  id: 'lower.exile-graveyard-card-types',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseMinCardTypes'],
  // The sentence's "you may" and the rule's own are the same offer: the engine asks once, a choice of none or some cards (CR 608.2d).
  acceptsOptional: true,
  lower(clause) {
    const types = arg(clause, 'types');
    const may = arg(clause, 'may');
    const optional = clause.optional || (may?.kind === 'flag' && may.value);
    if (types?.kind !== 'number' || !optional) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'graveyard', controller: 'you' },
            anyNumber: true,
            optional: true,
            minCardTypes: types.value,
          },
          to: 'exile',
        },
      ],
      rule: clause.rule,
    };
  },
};

const PUT_PERMANENT_FROM_AMONG_EXILED: Lowering<IrClause, Effects> = {
  head: 'putPermanentFromAmongExiled',
  id: 'lower.put-permanent-from-among-exiled',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseAmongMoved'],
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    const to = arg(clause, 'to');
    // "Them" is the cards of the exile right before: after any other instruction it names something this lowering does not know (CR 608.2c).
    if (objects?.kind !== 'noun' || to?.kind !== 'zoneSpec' || !ctx.exiledAnyCardTypes) {
      return failure(clause);
    }
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'exile', controller: 'you' },
            fromMoved: true,
          },
          to: 'battlefield',
          controller: 'you',
          ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const DEATH_TOLL_WINTER_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_GRAVEYARD_CARD_TYPES,
  PUT_PERMANENT_FROM_AMONG_EXILED,
];
