/**
 * Lowering of the Revival Trance deck (issue 97): "Starting with the next opponent in turn order, each opponent chooses a creature card in your graveyard that hasn't been chosen.
 * Return each card chosen this way to the battlefield under your control."
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/** The engine's `eachOpponentChoosesGraveyardCard` (CR 101.4, 608.2d, 404.1, 110.2a). */
export const OPPONENTS_CHOOSE_GRAVEYARD_CARD: Lowering<IrClause, Effects> = {
  head: 'opponentsChooseGraveyardCard',
  id: 'lower.opponents-choose-graveyard-card',
  needs: ['effect:eachOpponentChoosesGraveyardCard'],
  lower(clause) {
    const what = operand(clause, 'objects');
    if (what?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    if (filter.value.zone !== 'graveyard') return failure(clause);
    const { controller: _you, ...described } = filter.value;
    return {
      ok: true,
      value: [{ kind: 'eachOpponentChoosesGraveyardCard', filter: described }],
      rule: clause.rule,
    };
  },
};

export const REVIVAL_TRANCE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  OPPONENTS_CHOOSE_GRAVEYARD_CARD,
];
