/**
 * Lowerings of the Squirreled Away deck, group 4 (Insatiable Frugivore): "exile three cards from your graveyard", the engine's `moveToZone` to exile of a `choose` of that many cards in
 * the controller's graveyard. A "you may" before it is the engine's `may` of the clause (the question comes first, and a player with fewer cards can't take the offer, CR 608.2d).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const EXILE_CHOSEN_CARDS: Lowering<IrClause, Effects> = {
  head: 'exileChosenCards',
  id: 'lower.exile-chosen-cards',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.count?.kind !== 'number') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, zone: 'graveyard', controller: 'you' },
            count: objects.count.value,
          },
          to: 'exile',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const SQUIRRELED_G4_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [EXILE_CHOSEN_CARDS];
