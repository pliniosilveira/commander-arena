/**
 * Lowering of the permanents that give the cards of their controller's hand or graveyard a keyword whose cost is made from the card's mana cost (CR 702.94a, 702.138a, 118.9, 613.1f):
 * the static ability `grantKeywordFromManaCost`.
 */
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrNoun, IrStaticEffect } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type Grant = Extract<IrStaticEffect, { kind: 'manaCostKeywordGrant' }>;

export function isManaCostKeywordGrantStatic(effect: IrStaticEffect): effect is Grant {
  return effect.kind === 'manaCostKeywordGrant';
}

const staticFailure = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/** The cards that get the keyword, by what they are (`lowerFilter` of the noun the rule built, with no zone and no controller, which the engine's node refuses). */
function cardsOf(noun: IrNoun): LowerResult<ObjectFilter> {
  const filter = lowerFilter(noun);
  if (!filter.ok) return filter;
  const { zone, controller, owner, ...rest } = filter.value;
  void zone;
  void controller;
  void owner;
  return { ok: true, value: rest, rule: noun.rule };
}

/** "Each enchantment card in your hand has miracle. Its miracle cost is ...": a statement about the cards of the controller, with no condition of its own. */
export function lowerManaCostKeywordGrantStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isManaCostKeywordGrantStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return staticFailure(ability);
  }
  const blocked = missingFeatures(['ability:static', 'static:grantKeywordFromManaCost']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  const what = cardsOf(effect.cards);
  if (!what.ok) return what;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordFromManaCost',
          what: what.value,
          grant:
            effect.keyword === 'miracle'
              ? { kind: 'miracle', reduce: effect.reduce }
              : { kind: 'escape', exile: effect.exile },
        },
      },
    ],
    rule: ability.rule,
  };
}
