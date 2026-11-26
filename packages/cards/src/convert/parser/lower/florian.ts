/**
 * The lowering of `rules/effect/florian.ts` (Florian, Voldaren Scion): the engine's `lookAtTop` at the number of cards that is the life the opponents lost this turn, one card exiled,
 * the rest on the bottom in a random order, and the `mayPlay` of the exiled card until end of turn.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/** "Look at the top X cards ... where X is the total amount of life your opponents lost this turn. Exile one of those cards ... You may play the exiled card this turn." */
const LOOK_LOST_LIFE_EXILE_ONE_PLAY: Lowering<IrClause, Effects> = {
  head: 'lookLostLifeExileOnePlay',
  id: 'lower.look-lost-life-exile-one-play',
  needs: ['effect:lookAtTop', 'effect:mayPlay', 'amount:opponentsLifeLostThisTurn'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'lookAtTop',
        count: { kind: 'opponentsLifeLostThisTurn' },
        take: { filter: {}, max: 1, min: 1, to: 'exile' },
        rest: 'bottomRandom',
      },
      { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
    ],
    rule: clause.rule,
  }),
};

export const FLORIAN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_LOST_LIFE_EXILE_ONE_PLAY,
];
