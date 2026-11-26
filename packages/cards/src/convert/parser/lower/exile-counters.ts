/**
 * Lowerings of the counters a card has in exile (Mari, the Killing Quill; CR 122.1): "exile it with a hit counter on it" and "remove a hit counter from a card that player owns in
 * exile".
 */
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { objectSelectorOf, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Exile it with a hit counter on it." (CR 406.1, 122.1, 400.7j): the engine's `exile` of the permanent a trigger about a permanent is about (the card it became), then `addCounters` on the
 * card that exile made (`moved`, a new object in exile). Only the permanent of such a trigger: any other "it" is not read.
 */
const EXILE_WITH_COUNTER: Lowering<IrClause, Effects> = {
  head: 'exileWithCounter',
  id: 'lower.exile-with-counter',
  needs: ['effect:exile', 'effect:addCounters', 'selector:triggerSubject', 'selector:moved'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const what = arg(clause, 'objects');
    if (counter?.kind !== 'counterSpec' || what?.kind !== 'noun' || ctx.owner === 'spell') {
      return failure(clause);
    }
    const objects = objectSelectorOf(what, ctx, { triggerSubject: true });
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'triggerSubject') return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'exile', objects: objects.value },
        { kind: 'addCounters', objects: { kind: 'moved' }, counter: counter.name, count: 1 },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You may remove a hit counter from a card that player owns in exile." (CR 122.1, 108.3, 608.2d): the engine's `removeChosenCounters` with one counter of the kind at most, from the cards the
 * player owns in exile that have one, which the controller may not decline once the instruction runs (`required`): a "you may" in the text is the `optional` of the ability or the `may` of
 * an offer around the instruction. What was removed is what "if you do" reads.
 */
const REMOVE_FROM_OWNED_EXILED: Lowering<IrClause, Effects> = {
  head: 'removeCounterFromOwnedExiled',
  id: 'lower.remove-counter-from-owned-exiled',
  needs: ['effect:removeChosenCounters'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const who = arg(clause, 'player');
    if (counter?.kind !== 'counterSpec' || who?.kind !== 'noun') return failure(clause);
    const owner = playerSelectorOf(who, ctx);
    if (!owner.ok) return owner;
    return {
      ok: true,
      value: [
        {
          kind: 'removeChosenCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'exile', owner: owner.value, hasCounter: counter.name },
          },
          upTo: 1,
          counter: counter.name,
          required: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EXILE_COUNTERS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_WITH_COUNTER,
  REMOVE_FROM_OWNED_EXILED,
];
