/**
 * Lowerings of group C of the Family Matters deck: "Look at the top six cards of your library. You may put a creature card from among them onto the battlefield tapped and attacking. Put the
 * rest on the bottom of your library in a random order. Return that creature to its owner's hand at end of combat." (Arthur, Marigold Knight, CR 508.4, 701.20a, 401.4, 603.7c, 511.1).
 */
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const MOVED = { kind: 'moved' } as const;

/**
 * The engine's `lookAtTop` of the controller's own library, one card of the kind put onto the battlefield tapped, the rest on the bottom in a random order; then
 * `enterAttacking` of the creature put there (the controller chooses what it attacks, CR 508.4) and a delayed move of that creature to its owner's hand at the end of combat. A creature
 * can enter attacking only in the effect of an attack trigger (the engine refuses it elsewhere), so any other ability is not lowered.
 */
const LOOK_PUT_ATTACKING_RETURN: Lowering<IrClause, Effects> = {
  head: 'lookPutAttackingReturn',
  id: 'lower.look-put-attacking-return',
  needs: [
    'effect:lookAtTop',
    'effect:enterAttacking',
    'effect:delayedTrigger',
    'effect:moveToZone',
    'selector:moved',
    'ability:delayedReturnToHand',
  ],
  lower(clause, ctx) {
    if (!ctx.selfAttackTrigger && ctx.attackBatchPlayer === null) return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const take = arg(clause, 'take');
    if (take?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter({ ...take, filter: withoutZone(take.filter) });
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'lookAtTop',
          count: count.value,
          take: { filter: filter.value, max: 1, to: 'battlefield', tapped: true },
          rest: 'bottomRandom',
        },
        { kind: 'enterAttacking', objects: MOVED },
        {
          kind: 'delayedTrigger',
          at: { step: 'combatEnd', whose: 'each' },
          effect: { kind: 'moveToZone', objects: MOVED, to: 'hand' },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const FAMILY_MATTERS_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  LOOK_PUT_ATTACKING_RETURN,
];
