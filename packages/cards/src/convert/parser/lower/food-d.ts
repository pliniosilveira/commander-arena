/**
 * Lowerings of group D of the Food and Fellowship deck (Lobelia, Defender of Bag End): the permission to play a card exiled with this permanent without paying its mana cost.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Until end of turn, you may play a card exiled with ~ without paying its mana cost." (CR 607.2a, 601.2, 305.1, 118.9, 611.2a): the engine's `mayPlay` of the `linkedExile` cards of the
 * permanent, until end of turn, `free`. Only in an ability of a permanent that exiles cards with its linked ability, which the engine's validation asks for.
 */
const MAY_PLAY_LINKED: Lowering<IrClause, Effects> = {
  head: 'mayPlayLinked',
  id: 'lower.may-play-linked',
  needs: ['effect:mayPlay', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause) {
    if (clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'mayPlay', objects: { kind: 'linkedExile' }, lasts: 'endOfTurn', free: true },
      ],
      rule: clause.rule,
    };
  },
};

export const FOOD_D_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [MAY_PLAY_LINKED];
