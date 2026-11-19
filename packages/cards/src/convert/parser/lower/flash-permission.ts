/**
 * Lowering of "You may cast spells this turn as though they had flash." (Quandrix Unlimited deck, group F; Alchemist's Refuge).
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/**
 * The engine's `grantCastAsThoughFlash` of "you" until end of turn (CR 601.3b, 702.8a, 611.2): a permission is a "may" by nature, so the "you may" the sentence says
 * (the clause is marked optional) asks nothing more of the player and is accepted.
 */
const CAST_AS_THOUGH_FLASH: Lowering<IrClause, Effects> = {
  head: 'castAsThoughFlash',
  id: 'lower.cast-as-though-flash',
  needs: ['effect:grantCastAsThoughFlash'],
  acceptsOptional: true,
  lower(clause) {
    return {
      ok: true,
      value: [
        { kind: 'grantCastAsThoughFlash', player: { kind: 'you' }, duration: 'untilEndOfTurn' },
      ],
      rule: clause.rule,
    };
  },
};

export const FLASH_PERMISSION_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CAST_AS_THOUGH_FLASH,
];
