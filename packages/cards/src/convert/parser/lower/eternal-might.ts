/**
 * Static lowering of the Eternal Might deck (issue 104): "Each creature card in your hand has cycling {1}{U}." (CR 702.29a, 613.1f, 611.3a): the engine's
 * `grantKeywordToHandCards`, a static ability of a permanent that gives the cards of the controller's hand a cycling ability.
 */
import { type Ability, CARD_TYPES, type CardType } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type HandCycling = Extract<IrStaticEffect, { kind: 'handCycling' }>;

export function isHandCyclingStatic(effect: IrStaticEffect): effect is HandCycling {
  return effect.kind === 'handCycling';
}

const failure = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/** "Each creature card in your hand has cycling {1}{U}.": a statement about the cards of the controller's hand, with one effect and no condition of its own. */
export function lowerHandCyclingStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isHandCyclingStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return failure(ability);
  }
  const known = effect.cardTypes.every((t) => (CARD_TYPES as readonly string[]).includes(t));
  if (!known || effect.cardTypes.length === 0) return failure(ability);
  const blocked = missingFeatures(['ability:static', 'static:grantKeywordToHandCards']);
  if (blocked.length > 0) return failure(ability, blocked);
  const cost = lowerCost(effect.cost);
  if (!cost.ok) return cost;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToHandCards',
          what: { types: effect.cardTypes as CardType[] },
          keyword: { kind: 'cycling', cost: [cost.value] },
        },
      },
    ],
    rule: ability.rule,
  };
}
