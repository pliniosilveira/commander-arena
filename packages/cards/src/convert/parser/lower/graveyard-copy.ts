/**
 * Lowering of the token copy of a card exiled from a graveyard (issue 104, God-Pharaoh's Gift: "you may exile a creature card from your graveyard. If you do, create a token that's a copy
 * of that card, except it's a 4/4 black Zombie"): the engine's `moveToZone` to exile of a `choose` among the cards of the controller's graveyard, `optional` when the text says "you may"
 * (the choice of none is declining the offer, CR 608.2d). The card exiled is what `moved` names afterwards ("that card": `copySourceOf`, `ctx.chosenExiled`), and what the `didPrevious`
 * of "If you do" reads (CR 608.2c).
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const EXILE_CHOSEN_CARD: Lowering<IrClause, Effects> = {
  head: 'exileChosenCard',
  id: 'lower.exile-chosen-card',
  needs: ['effect:moveToZone', 'selector:choose'],
  // The sentence's "you may" is the offer the engine asks once, as a choice of none or one card (CR 608.2d).
  acceptsOptional: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun') return failure(clause);
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
            ...(clause.optional ? { optional: true as const } : {}),
          },
          to: 'exile',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const GRAVEYARD_COPY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [EXILE_CHOSEN_CARD];
