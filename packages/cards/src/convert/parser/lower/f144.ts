/**
 * Clause lowerings of deck support issue 144. Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "If any of those cards remain exiled, put them into your graveyard." (Glimpse the Impossible; CR 400.7, 404.1, 608.2c): the engine's `moveToZone` of the cards the `exileTop` before it
 * exiled (`moved`) to the graveyard. In a delayed ability the engine binds them as the ability is created, and finds only those still in exile when it triggers. Only after such an exile.
 */
export const PUT_EXILED_INTO_GRAVEYARD: Lowering<IrClause, Effects> = {
  head: 'putExiledIntoGraveyard',
  id: 'lower.put-exiled-into-graveyard',
  needs: ['effect:moveToZone', 'effect:exileTop'],
  lower(clause, ctx) {
    if (ctx.exiled !== 'top') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'moveToZone', objects: { kind: 'moved' }, to: 'graveyard' }],
      rule: clause.rule,
    };
  },
};

/**
 * "You may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost. If that spell would be put into your graveyard, exile it instead."
 * (Diviner of Mist, issue 102; CR 608.2g, 118.9, 614.1a): the engine's `castFree` of a choice from the controller's graveyard, with `exileInstead` for the rider. The engine asks the
 * controller (and the question may be declined), so the "you may" is that question and no `may` of its own (`acceptsOptional`).
 */
export const CAST_CHOSEN_GRAVEYARD_SPELL: Lowering<IrClause, Effects> = {
  head: 'castChosenGraveyardSpell',
  id: 'lower.cast-chosen-graveyard-spell',
  needs: ['effect:castFree', 'ability:castFreeFromGraveyard'],
  acceptsOptional: true,
  lower(clause) {
    const limit = arg(clause, 'limit');
    if (limit?.kind !== 'number') return failure(clause);
    const rider = arg(clause, 'exileInstead');
    return {
      ok: true,
      value: [
        {
          kind: 'castFree',
          objects: {
            kind: 'choose',
            filter: {
              zone: 'graveyard',
              anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
              manaValue: { cmp: 'atMost', value: limit.value },
            },
          },
          ...(rider === undefined ? {} : { exileInstead: true as const }),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const F144_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PUT_EXILED_INTO_GRAVEYARD,
  CAST_CHOSEN_GRAVEYARD_SPELL,
];
