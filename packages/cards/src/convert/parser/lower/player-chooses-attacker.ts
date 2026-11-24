/**
 * Lowering of "that player chooses an attacking creature" (Mirkwood Trapper; CR 608.2d, 508.1k): the player the trigger is about chooses one attacking creature as the ability resolves.
 * The engine's `chooseObjects` with that player as the `chooser`; the creature is what "it" names in the sentences after.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

const THAT_PLAYER_CHOOSES_ATTACKER: Lowering<IrClause, Effects> = {
  head: 'thatPlayerChoosesAttacker',
  id: 'lower.that-player-chooses-attacker',
  needs: ['effect:chooseObjects', 'selector:chooseObjectsChooser', 'selector:chosen'],
  lower(clause, ctx) {
    const objects = clause.args.objects;
    // "That player" must name the player of an attack trigger: nobody else makes a choice for the ability.
    if (objects?.kind !== 'noun' || objects.ref === undefined) return failure(clause);
    if (ctx.thatPlayer?.selector.kind !== 'triggerPlayer') return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    ctx.chosenObjectRefs.add(objects.ref);
    return {
      ok: true,
      value: [
        {
          kind: 'chooseObjects',
          id: objects.ref,
          filter: { ...filter.value, zone: 'battlefield' },
          count: 1,
          exactly: true,
          chooser: ctx.thatPlayer.selector,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PLAYER_CHOOSES_ATTACKER_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  THAT_PLAYER_CHOOSES_ATTACKER,
];
