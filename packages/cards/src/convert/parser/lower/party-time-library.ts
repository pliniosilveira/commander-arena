/**
 * Lowering of the Party Time deck, group "library": "You may exile any number of non-Angel creatures you control until this creature leaves the battlefield" (Glorious Protector,
 * CR 608.2d, 610.3) is the engine's `moveToZone` into exile of an `anyNumber` choice among the controller's permanents, with `until` (the cards return when the permanent with
 * the ability leaves the battlefield). Only in an ability of a permanent: an instant or a sorcery has no permanent to leave.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const EXILE_ANY_NUMBER_UNTIL_LEAVES: Lowering<IrClause, Effects> = {
  head: 'exileAnyNumberUntilLeaves',
  id: 'lower.exile-any-number-until-leaves',
  needs: ['effect:moveToZone', 'selector:choose', 'ability:chooseExileUntilLeaves'],
  // "Any number" includes none, so the choice is the offer itself: with or without "you may" the engine asks once, for none or some permanents (CR 608.2d).
  acceptsOptional: true,
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || ctx.owner === 'spell') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'battlefield', controller: 'you' },
            anyNumber: true,
            optional: true,
          },
          to: 'exile',
          untilSourceLeaves: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PARTY_TIME_LIBRARY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_ANY_NUMBER_UNTIL_LEAVES,
];
