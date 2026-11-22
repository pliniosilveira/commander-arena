/**
 * Lowerings of Urianger Augurelt's two abilities: the card of the top of the library exiled face down by a permanent, and the permission to play the cards it exiled, with a cheaper cost for
 * the spells.
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Look at the top card of your library. You may exile it face down." (CR 701.20, 406.3, 607.2a): the engine's `lookAtTop` of one card, taken (when the player chooses) into exile face
 * down and remembered by the permanent; a card not taken stays on top. Only in an ability of a permanent, which the engine's validation asks for.
 */
const LOOK_TOP_MAY_EXILE_FACE_DOWN: Lowering<IrClause, Effects> = {
  head: 'lookTopMayExileFaceDown',
  id: 'lower.look-top-may-exile-face-down',
  needs: ['effect:lookAtTop'],
  lower(clause) {
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: 1,
          take: { filter: {}, max: 1, to: 'exileFaceDown' },
          rest: 'top',
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast." (CR 607.2a, 601.2, 305.1, 601.2f, 611.2a): the engine's `mayPlay` of the
 * `linkedExile` cards of the permanent, until end of turn, with `lessGeneric`.
 */
const MAY_PLAY_LINKED_LESS: Lowering<IrClause, Effects> = {
  head: 'mayPlayLinkedLess',
  id: 'lower.may-play-linked-less',
  needs: ['effect:mayPlay', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    const less = amountArg(clause, 'less', ctx);
    if (!less.ok) return less;
    if (typeof less.value !== 'number') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'mayPlay',
          objects: { kind: 'linkedExile' },
          lasts: 'endOfTurn',
          lessGeneric: less.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const ARCANUM_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_TOP_MAY_EXILE_FACE_DOWN,
  MAY_PLAY_LINKED_LESS,
];
