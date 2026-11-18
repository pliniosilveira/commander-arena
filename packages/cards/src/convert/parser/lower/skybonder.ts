/**
 * Lowering of the Jubilant Skybonder group (First Flight deck, D-149): "Spells your opponents cast that target ~ cost {2} more to cast." (CR 601.2f, 601.2c, 604.2) as the engine's
 * `costIncrease` static ability, on a permanent or (CR 613.1f, 604.1) given by a group's quoted static ability: `~` in the quotation is the permanent that has it.
 */
import type { Ability, StaticEffect } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrAbility, IrNoun, IrQuotedAbility, IrStaticEffect } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerFailure, LowerResult } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };
type Static = Extract<IrAbility, { kind: 'static' }>;
type Increase = Extract<StaticEffect, { kind: 'costIncrease' }>;
type IncreaseAbility = Extract<Ability, { kind: 'static' }> & { readonly static: Increase };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** Whether the effect is the tax of a spell that targets the permanent with the ability. */
export function isCostIncrease(
  effect: IrStaticEffect,
): effect is Extract<IrStaticEffect, { kind: 'costIncrease' }> {
  return effect.kind === 'costIncrease';
}

/** The engine ability of one read statement: the spells the subject names, the generic mana more. */
function increaseOf(ability: Static): LowerResult<IncreaseAbility> {
  const { subject, effects } = ability.statement;
  const [effect, ...more] = effects;
  if (
    effect === undefined ||
    !isCostIncrease(effect) ||
    more.length > 0 ||
    ability.statement.condition !== undefined ||
    ability.statement.also !== undefined ||
    ability.statement.functionsIn !== undefined ||
    subject.det !== 'each'
  ) {
    return failure(ability);
  }
  const missing = missingFeatures(['ability:static', 'static:costIncrease']);
  if (missing.length > 0) return failure(ability, missing);
  const filter = lowerFilter(subject as IrNoun);
  if (!filter.ok) return filter;
  return {
    ok: true,
    value: {
      kind: 'static',
      static: { kind: 'costIncrease', spells: filter.value, amount: effect.amount },
    },
    rule: ability.rule,
  };
}

/** "Spells your opponents cast that target ~ cost {2} more to cast." as an ability of a card. */
export function lowerCostIncrease(ability: Static): LowerResult<readonly Ability[]> {
  const lowered = increaseOf(ability);
  return lowered.ok ? { ok: true, value: [lowered.value], rule: lowered.rule } : lowered;
}

/**
 * The quoted static ability a group of permanents has: the cost increase the nested reading found, bound and lowered as the ability of a card is. The engine gives it to each permanent
 * the group names, which has it as its own, so a card that names itself inside the quotation (where `~` could be the card) is not read.
 */
export function lowerGrantedCostIncrease(
  quoted: IrQuotedAbility,
  at: At,
): LowerResult<IncreaseAbility> {
  const inner = quoted.ability;
  if (inner.kind !== 'static') return failure(at);
  const bound = bind(inner, {});
  if (!bound.ok || bound.ability.kind !== 'static') return failure(at);
  const lowered = increaseOf(bound.ability);
  return lowered.ok ? lowered : failure(at, lowered.needs);
}
