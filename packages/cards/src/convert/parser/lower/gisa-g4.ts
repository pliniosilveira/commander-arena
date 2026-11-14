/**
 * Lowerings of group 4 of the Gisa deck (issue 41, D-1430 to D-1432): the sentences about "it" after a return from the graveyard (Whip of Erebos), the cards exiled with a
 * permanent put onto the battlefield (Ghost Vacuum) and the reduction of the cost of the abilities of cards in a graveyard (Embalmer's Tools). "It" is read only as the object the
 * instruction before it put onto the battlefield (`ctx.movedOnto`, the engine's `moved`); after anything else the sentence is not lowered (never guessed).
 */
import type { Ability, Effect, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrClause, IrStaticEffect } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerContext, LowerFailure, Lowering, LowerResult } from './types';

/** The objects of an "it" clause, which must be what the instruction before it put onto the battlefield. */
function movedObjects(
  clause: IrClause,
  ctx: LowerContext,
): LowerResult<readonly Effects[number][]> {
  return eachObject(
    clause,
    ctx,
    (objects) => ({ kind: 'exileIfLeaves', objects: objects as { kind: 'moved' } }),
    'objects',
    { moved: true },
  );
}

/** Whether every effect names the `moved` objects, as the engine's checks for this slice need. */
const allMoved = (effects: readonly Effect[]) =>
  effects.every((e) => 'objects' in e && (e.objects as { kind: string }).kind === 'moved');

const GRANT_FOR_GOOD: Lowering<IrClause, Effects> = {
  head: 'grantKeywordForGood',
  id: 'lower.grant-keyword-for-good',
  needs: ['effect:grantKeyword', 'selector:moved'],
  lower(clause, ctx) {
    const word = arg(clause, 'keyword');
    if (word?.kind !== 'keywordName' || word.protection !== undefined) return failure(clause);
    const kind = keywordKind(word.name);
    if (kind === undefined || !isGrantable(kind)) return failure(clause);
    const lowered = eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'grantKeyword',
        objects,
        keyword: plainKeyword(kind),
        duration: 'permanent',
      }),
      'objects',
      { moved: true },
    );
    if (!lowered.ok) return lowered;
    return allMoved(lowered.value) ? lowered : failure(clause);
  },
};

const EXILE_AT_END_STEP: Lowering<IrClause, Effects> = {
  head: 'exileAtEndStep',
  id: 'lower.exile-at-end-step',
  needs: ['effect:delayedTrigger', 'effect:exile', 'selector:moved'],
  lower(clause, ctx) {
    const lowered = eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'each' },
        effect: { kind: 'exile', objects },
      }),
      'objects',
      { moved: true },
    );
    if (!lowered.ok) return lowered;
    const inner = lowered.value.map((e) => (e.kind === 'delayedTrigger' ? e.effect : e));
    return allMoved(inner) ? lowered : failure(clause);
  },
};

const EXILE_IF_LEAVES: Lowering<IrClause, Effects> = {
  head: 'exileIfLeaves',
  id: 'lower.exile-if-leaves',
  needs: ['effect:exileIfLeaves', 'selector:moved'],
  lower(clause, ctx) {
    const lowered = movedObjects(clause, ctx);
    if (!lowered.ok) return lowered;
    return allMoved(lowered.value) ? lowered : failure(clause);
  },
};

/** "Put each creature card exiled with ~ onto the battlefield under your control with a flying counter on it." */
const PUT_LINKED_EXILE: Lowering<IrClause, Effects> = {
  head: 'putLinkedExile',
  id: 'lower.put-linked-exile',
  needs: ['effect:moveToZone'],
  lower(clause) {
    const what = operand(clause, 'objects');
    const to = arg(clause, 'to');
    if (what?.kind !== 'noun' || what.det !== 'linkedExile' || to?.kind !== 'zoneSpec') {
      return failure(clause);
    }
    if (to.zone !== 'battlefield' || to.whose !== 'you') return failure(clause);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    // The cards are described by what they are: the engine reads them in exile, whoever controls the permanent.
    const { zone: _zone, controller: _controller, ...card } = filter.value as ObjectFilter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: { kind: 'linkedExile', filter: card },
          to: 'battlefield',
          controller: 'you',
          ...(to.counters === undefined ? {} : { withCounters: { ...to.counters } }),
        },
      ],
      rule: clause.rule,
    };
  },
};

export const GISA_G4_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  GRANT_FOR_GOOD,
  EXILE_AT_END_STEP,
  EXILE_IF_LEAVES,
  PUT_LINKED_EXILE,
];

type Static = Extract<IrAbility, { kind: 'static' }>;

function staticFailure(ability: Static, needs: LowerFailure['needs'] = []): LowerFailure {
  return { ok: false, needs, at: ability.span, rule: ability.rule };
}

/**
 * "Activated abilities of creature cards in your graveyard cost {1} less to activate." (D-1432, CR 601.2f, 118.7, 113.6b): the engine's `abilityCostReduction` of the
 * abilities of the cards of the kind in the graveyard of the controller of the permanent. A statement with a condition, a second effect or a second subject is not this one.
 */
export function lowerGraveyardAbilityCostReduction(
  ability: Static,
  effect: Extract<IrStaticEffect, { kind: 'graveyardAbilityCostReduction' }>,
  more: number,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  if (more > 0 || statement.condition !== undefined || statement.also !== undefined) {
    return staticFailure(ability);
  }
  const blocked = missingFeatures(['ability:static', 'static:abilityCostReduction']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'ofObjects',
          objects: {
            zone: 'graveyard',
            types: [...effect.types] as never,
            controller: 'you',
          },
          amount: effect.amount,
        },
      },
    ],
    rule: ability.rule,
  };
}
