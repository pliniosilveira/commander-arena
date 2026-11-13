/**
 * Lowering of "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard."
 * (Fact or Fiction, D-303, CR 700.3): the engine's `revealAndSeparate`. The wording fixes who separates (an opponent, so the controller chooses the pile) and where the pile
 * chosen goes (the hand; the other pile goes to the graveyard).
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects } from './clauses';
import type { Lowering } from './types';

const REVEAL_AND_SEPARATE: Lowering<IrClause, Effects> = {
  head: 'revealAndSeparate',
  id: 'lower.reveal-and-separate',
  needs: ['effect:revealAndSeparate'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'revealAndSeparate',
          count: count.value,
          separator: 'opponent',
          chosenTo: 'hand',
          otherTo: 'graveyard',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PILES_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_AND_SEPARATE];
