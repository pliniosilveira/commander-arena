/**
 * Lowering of "Target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your
 * control. That player puts the rest on the bottom of their library in a random order." (Lonis, Cryptozoologist, issue 128; CR 701.20a, 110.2, 401.4): the engine's `lookAtTop` of the
 * library of the player the noun names, all the cards revealed, one nonland permanent card with mana value at most X put onto the battlefield, the rest on the bottom in a random order.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

export const OPPONENT_REVEALS_PUT_NONLAND: Lowering<IrClause, Effects> = {
  head: 'opponentRevealsPutNonland',
  id: 'lower.opponent-reveals-put-nonland',
  needs: ['effect:lookAtTop', 'ability:lookTakeFromPlayer'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const owner = arg(clause, 'from');
    if (owner?.kind !== 'noun') return failure(clause);
    const from = playerSelectorOf(owner, ctx);
    if (!from.ok) return from;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          from: from.value,
          revealAll: true,
          take: {
            filter: { notTypes: ['land', 'instant', 'sorcery'] },
            max: 1,
            to: 'battlefield',
            manaValueAtMost: count.value,
          },
          rest: 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const OPPONENT_REVEALS_PUT_LOWERINGS = [OPPONENT_REVEALS_PUT_NONLAND];
