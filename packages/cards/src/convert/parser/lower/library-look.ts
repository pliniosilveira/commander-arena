/**
 * The lowerings of two looks at the top of a library (`rules/effect/library.ts`): the cards of a target player's library put back in an order the controller chooses, and three cards
 * of the controller's own library sorted into the hand, the top and the bottom.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Look at the top three cards of target player's library, then put them back in any order. You may have that player shuffle." (CR 401.2, 115.1, 608.2d, 701.24): the engine's
 * `lookAndReorder` of the library of the player the noun names (`from`), then, when the offer is said, a `may` of that player's `shuffle`, which the controller answers having
 * looked at the cards. Both name the same target.
 */
export const LOOK_AND_REORDER_PLAYER: Lowering<IrClause, Effects> = {
  head: 'lookAndReorderPlayer',
  id: 'lower.look-and-reorder-player',
  needs: [
    'effect:lookAndReorder',
    'ability:lookReorderFromPlayer',
    'effect:may',
    'effect:shuffle',
    'selector:target',
  ],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const owner = arg(clause, 'from');
    if (owner?.kind !== 'noun') return failure(clause);
    const from = playerSelectorOf(owner, ctx);
    if (!from.ok) return from;
    const look: Effect = { kind: 'lookAndReorder', count: count.value, from: from.value };
    const offered = arg(clause, 'mayShuffle')?.kind === 'flag';
    const shuffle: Effect = { kind: 'may', effect: { kind: 'shuffle', player: from.value } };
    return { ok: true, value: offered ? [look, shuffle] : [look], rule: clause.rule };
  },
};

/**
 * "Look at the top three cards of your library. Put one of those cards into your hand, one on top of your library, and one on the bottom of your library." (CR 401.2, 608.2c):
 * the engine's `lookAndSplit` of the controller's own library with `top`: one card to the hand, one left on top, one to the bottom, done in that order when the library holds
 * fewer than three cards. Nothing is exiled, so no later sentence may name "the exiled card".
 */
export const LOOK_AND_SPLIT_TOP: Lowering<IrClause, Effects> = {
  head: 'lookAndSplitTop',
  id: 'lower.look-and-split-top',
  needs: ['effect:lookAndSplit', 'ability:lookSplitTop'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (count.value !== 3) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'lookAndSplit', count: 3, hand: 1, top: 1, bottom: 1, exile: 0 }],
      rule: clause.rule,
    };
  },
};

export const LIBRARY_LOOK_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_AND_REORDER_PLAYER,
  LOOK_AND_SPLIT_TOP,
];
