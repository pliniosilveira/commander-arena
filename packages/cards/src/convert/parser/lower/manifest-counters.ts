/**
 * The lowerings of `rules/effect/manifest-counters.ts` (CR 701.40g, 708.8, 608.2d, 122.6): "turn that creature face up" is the engine's `turnFaceUp` of the permanent a trigger is about or
 * of the creature manifest dread manifested; "turn that creature face up or put a +1/+1 counter on it" is a `chooseOne` of that and an `addCounters` of the same permanent.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure } from './clauses';
import { lowerFilter, objectSelectorOf } from './nouns';
import type { Lowering } from './types';

const OPTIONS = { triggerSubject: true, moved: true } as const;

const TURN_FACE_UP: Lowering<IrClause, Effects> = {
  head: 'turnFaceUp',
  id: 'lower.turn-face-up',
  needs: ['effect:turnFaceUp'],
  lower(clause, ctx) {
    return eachObject(
      clause,
      ctx,
      (objects): Effect => ({ kind: 'turnFaceUp', objects }),
      'objects',
      OPTIONS,
    );
  },
};

const TURN_FACE_UP_OR_COUNTER: Lowering<IrClause, Effects> = {
  head: 'turnFaceUpOrCounter',
  id: 'lower.turn-face-up-or-counter',
  needs: ['effect:chooseOne', 'effect:turnFaceUp', 'effect:addCounters'],
  lower(clause, ctx) {
    const counter = arg(clause, 'counter');
    const first = arg(clause, 'objects');
    const second = arg(clause, 'again');
    if (counter?.kind !== 'counterSpec') return failure(clause);
    if (first?.kind !== 'noun' || second?.kind !== 'noun') return failure(clause);
    // Both halves are about the same permanent, said as "it" or as "that creature": the two words lower to the same selector.
    const one = objectSelectorOf(first, ctx, OPTIONS);
    if (!one.ok) return one;
    const other = objectSelectorOf(second, ctx, OPTIONS);
    if (!other.ok) return other;
    if (JSON.stringify(one.value) !== JSON.stringify(other.value)) return failure(clause);
    const objects = one.value;
    return {
      ok: true,
      value: [
        {
          kind: 'chooseOne',
          options: [
            { label: 'turn that creature face up', effect: { kind: 'turnFaceUp', objects } },
            {
              label: `put a ${counter.name} counter on that creature`,
              effect: { kind: 'addCounters', objects, counter: counter.name, count: 1 },
            },
          ],
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Turn a permanent you control face up" (Zimone, Mystery Unraveler; CR 608.2d, 701.40g): the engine's `turnFaceUp` of a `choose` selector over the face-down permanents the controller
 * controls that the noun describes. The sentence's "you may" and the rule's own are the one offer: the engine asks once, a choice of none or one permanent (`optional`).
 */
const TURN_FACE_UP_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'turnFaceUpChosen',
  id: 'lower.turn-face-up-chosen',
  needs: ['effect:turnFaceUp', 'selector:choose', 'selector:faceDown'],
  acceptsOptional: true,
  lower(clause) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.count !== undefined) return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    // "A permanent" with no owner named is the controller's own (`noun.a-permanent` never reads an opponent's); another player is refused.
    if (filter.value.controller !== undefined && filter.value.controller !== 'you') {
      return failure(clause);
    }
    const may = arg(clause, 'may');
    const optional = clause.optional || (may?.kind === 'flag' && may.value);
    return {
      ok: true,
      value: [
        {
          kind: 'turnFaceUp',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, controller: 'you', facing: 'down' },
            ...(optional ? { optional: true as const } : {}),
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const MANIFEST_COUNTERS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  TURN_FACE_UP,
  TURN_FACE_UP_CHOSEN,
  TURN_FACE_UP_OR_COUNTER,
];
