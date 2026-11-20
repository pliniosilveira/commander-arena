/**
 * Lowerings of the Mardu Surge deck (issue 101).
 *
 * - `doubleTokensThisTurn`: "Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead." (CR 614.1a, 614.5,
 *   611.2a): the engine's `doubleTokens`, for every token the controller would create.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

const DOUBLE_TOKENS_THIS_TURN: Lowering<IrClause, Effects> = {
  head: 'doubleTokensThisTurn',
  id: 'lower.double-tokens-this-turn',
  needs: ['effect:doubleTokens'],
  lower(clause) {
    const effect: Effect = { kind: 'doubleTokens', tokens: { token: true, controller: 'you' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const MARDU_SURGE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DOUBLE_TOKENS_THIS_TURN,
];
