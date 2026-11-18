/**
 * Lowerings of group 1 of the Galadriel deck (issue 43): reveal the top card of your library and do something when it is of a kind.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Reveal the top card of your library. If it's a creature or land card, draw a card." and "you may reveal the top card of your library. If a land card is revealed this way, put it onto
 * the battlefield tapped" (CR 701.20a, 608.2c): the engine's `revealTop` of the controller's own library, with the kind of the card (a filter that names no zone, controller or owner)
 * and either what is done when it matches (`onMatch`: a draw) or where it goes (`to`). "You may" is the `may` effect around it (the choice comes before anything is shown).
 */
const REVEAL_TOP_THEN: Lowering<IrClause, Effects> = {
  head: 'revealTopThen',
  id: 'lower.reveal-top-then',
  needs: ['effect:revealTop'],
  // The words "you may" of the clause are the offer of the engine's `may` effect, which asks the question before the card is revealed.
  acceptsOptional: true,
  lower(clause) {
    const what = arg(clause, 'what');
    const draw = arg(clause, 'draw');
    const hand = arg(clause, 'hand');
    const tapped = arg(clause, 'tapped');
    const otherwise = arg(clause, 'otherwise');
    if (what?.kind !== 'noun' || draw?.kind !== 'flag') return failure(clause);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    const you = { kind: 'you' } as const;
    const reveal: Effect = draw.value
      ? {
          kind: 'revealTop',
          player: you,
          ifMatches: filter.value,
          onMatch: { kind: 'draw', player: you, count: 1 },
        }
      : {
          kind: 'revealTop',
          player: you,
          ifMatches: filter.value,
          to: hand?.kind === 'flag' && hand.value ? 'hand' : 'battlefield',
          ...(tapped?.kind === 'flag' && tapped.value ? { tapped: true as const } : {}),
          // "Otherwise, put that card into your hand" (issue 310, CR 608.2c).
          ...(otherwise?.kind === 'flag' && otherwise.value
            ? { otherwiseTo: 'hand' as const }
            : {}),
        };
    return {
      ok: true,
      value: [clause.optional ? { kind: 'may', effect: reveal } : reveal],
      rule: clause.rule,
    };
  },
};

export const GALADRIEL_G1_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [REVEAL_TOP_THEN];
