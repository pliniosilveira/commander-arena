/**
 * The lowerings of `rules/effect/durnan.ts` (Durnan of the Yawning Portal, Vivien, Champion of the Wilds): the engine's `lookAtTop` of the controller's library and the `mayPlay` of the card
 * it exiled.
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains
 * exiled, you may cast it. That spell has undaunted." (Durnan of the Yawning Portal, CR 401.2, 406.3, 611.2, 702.125a).
 */
const LOOK_EXILE_CREATURE_UNDAUNTED: Lowering<IrClause, Effects> = {
  head: 'lookExileCreatureUndaunted',
  id: 'lower.look-exile-creature-undaunted',
  needs: ['effect:lookAtTop', 'effect:mayPlay'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: { types: ['creature'] }, max: 1, to: 'exile' },
          rest: 'bottomChosen',
        },
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          lasts: 'whileExiled',
          castOnly: true,
          undaunted: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a
 * creature spell." (Vivien, Champion of the Wilds, CR 401.2, 406.3, 611.2).
 */
const LOOK_EXILE_FACE_DOWN_CAST_CREATURE: Lowering<IrClause, Effects> = {
  head: 'lookExileFaceDownCastCreature',
  id: 'lower.look-exile-face-down-cast-creature',
  needs: ['effect:lookAtTop', 'effect:mayPlay'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (clause.rule === undefined) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: {}, max: 1, min: 1, to: 'exileFaceDownUnlinked' },
          rest: 'bottomChosen',
        },
        {
          kind: 'mayPlay',
          objects: { kind: 'moved' },
          lasts: 'whileExiled',
          lookAt: true,
          castOnly: true,
          creatureSpellsOnly: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const DURNAN_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_EXILE_CREATURE_UNDAUNTED,
  LOOK_EXILE_FACE_DOWN_CAST_CREATURE,
];
