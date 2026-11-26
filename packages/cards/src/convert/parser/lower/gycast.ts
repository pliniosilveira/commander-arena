/**
 * Lowering of the graveyard casts of the Revenant Recon deck (Mission Briefing). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import { CARD_TYPES, type CardType } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Choose an instant or sorcery card in your graveyard. You may cast it this turn. If that spell would be put into your graveyard, exile it instead." (Mission Briefing; CR 608.2d, 601.2,
 * 611.2a, 614.1a): the engine's `mayCast` of a `choose` selector of the controller's graveyard, with `exileInstead` for the rider. The choice is the controller's as the effect resolves
 * (nothing is asked with one candidate, nothing happens with none); the permission is for the rest of the turn.
 */
export const MAY_CAST_CHOSEN_GRAVEYARD_CARD: Lowering<IrClause, Effects> = {
  head: 'mayCastChosenGraveyardCard',
  id: 'lower.may-cast-chosen-graveyard-card',
  needs: [
    'effect:mayCast',
    'selector:choose',
    'duration:untilEndOfTurn',
    'ability:mayCastChosenFromGraveyard',
  ],
  lower(clause) {
    const cards = arg(clause, 'cards');
    const rider = arg(clause, 'exileInstead');
    if (cards?.kind !== 'noun' || rider?.kind !== 'flag') return failure(clause);
    const members = cards.filter.anyOf ?? [];
    const types = members.flatMap((member) => member.types ?? []);
    if (
      types.length === 0 ||
      types.length !== members.length ||
      !types.every((t): t is CardType => (CARD_TYPES as readonly string[]).includes(t))
    ) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'mayCast',
          objects: {
            kind: 'choose',
            filter: { zone: 'graveyard', anyOf: types.map((t) => ({ types: [t] })) },
          },
          duration: 'untilEndOfTurn',
          ...(rider.value ? { exileInstead: true as const } : {}),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const GYCAST_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  MAY_CAST_CHOSEN_GRAVEYARD_CARD,
];
