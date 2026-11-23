/**
 * "Reveal the top card of your library." (CR 701.20a, 400.7j): the engine's `revealTopCard` of your own library. The card is what "that card" of the instructions after it names (the
 * engine's `moved`, read by `amount:manaValueOf`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

export const REVEAL_TOP_CARD: Lowering<IrClause, Effects> = {
  head: 'revealTopCard',
  id: 'lower.reveal-top-card',
  needs: ['effect:revealTopCard'],
  lower(clause) {
    // "You may reveal" is a choice the card does not say.
    if (clause.optional) return failure(clause);
    const effect: Effect = { kind: 'revealTopCard', player: { kind: 'you' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const REVEAL_TOP_CARD_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_TOP_CARD];

/** Features the lowerings of this file can name, for the dimension test. */
export const REVEAL_TOP_CARD_NEEDS: readonly FeatureRef[] = ['effect:revealTopCard'];
