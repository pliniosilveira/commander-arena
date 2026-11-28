/**
 * "Activated abilities of Foods you control cost {1} less to activate." (Food and Fellowship deck, group B; CR 601.2f, 602.2b, 118.7): the engine's `abilityCostReduction` of the
 * abilities of the permanents on the battlefield the noun names, whoever activates them. A statement with a condition, a second effect or a second subject is not this one.
 */
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;

function staticFailure(ability: Static, needs: LowerFailure['needs'] = []): LowerFailure {
  return { ok: false, needs, at: ability.span, rule: ability.rule };
}

export function lowerPermanentAbilityCostReduction(
  ability: Static,
  effect: Extract<IrStaticEffect, { kind: 'permanentAbilityCostReduction' }>,
  more: number,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  if (more > 0 || statement.condition !== undefined || statement.also !== undefined) {
    return staticFailure(ability);
  }
  const blocked = missingFeatures(['ability:static', 'static:abilityCostReduction']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  const filter = lowerFilter(effect.objects);
  if (!filter.ok) return filter;
  const objects: ObjectFilter = { ...filter.value, zone: 'battlefield' };
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'abilityCostReduction',
          abilities: 'ofObjects',
          objects,
          amount: effect.amount,
          ...(effect.firstEachTurn === true ? { firstOfArtifactEachTurn: true as const } : {}),
        },
      },
    ],
    rule: ability.rule,
  };
}
