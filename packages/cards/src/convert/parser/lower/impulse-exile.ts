/**
 * The lowerings of `rules/effect/impulse-exile.ts` (Thief of Sanity, Gonti, Canny Acquisitor, Dream-Thief's Bandana, Siphon Insight): the engine's `lookAtTop` of the library of another
 * player, one card of it exiled face down and remembered by nobody, which the permission after it (`mayPlay` of `moved`, `lower.may-play`) names.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Look at the top card of that player's library, then exile it face down", "look at the top three cards of that player's library, exile one of them face down, then put the rest into
 * their graveyard", "look at the top two cards of target opponent's library. Exile one of them face down and put the other on the bottom of that library" (CR 401.2, 406.3, 701.20): the
 * engine's `lookAtTop` of the library of the player the noun names, one card taken (min and max 1) and exiled face down, the rest in the graveyard of their owner or on the bottom of the
 * library in a random order (with one card left, that is the bottom). The controller looked at the card, so the permission after it may look at it too (`ctx.exiledLookedAt`).
 */
export const LOOK_EXILE_FACE_DOWN_ONE: Lowering<IrClause, Effects> = {
  head: 'lookExileFaceDownOne',
  id: 'lower.look-exile-face-down-one',
  needs: ['effect:lookAtTop', 'ability:lookTakeFromPlayer'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const owner = arg(clause, 'from');
    if (owner?.kind !== 'noun') return failure(clause);
    const from = playerSelectorOf(owner, ctx);
    if (!from.ok) return from;
    const graveyard = arg(clause, 'restGraveyard')?.kind === 'flag';
    ctx.exiled = 'top';
    ctx.exiledFaceDown = true;
    ctx.exiledLookedAt = true;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          from: from.value,
          take: { filter: {}, max: 1, min: 1, to: 'exileFaceDownUnlinked' },
          rest: graveyard ? 'graveyard' : 'bottomRandom',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const IMPULSE_EXILE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_EXILE_FACE_DOWN_ONE,
];
