/**
 * Lowerings of the cards that give the instants and sorceries of a graveyard flashback with the cost equal to their mana cost (CR 702.34a, 118.9): the static ability of a permanent
 * (`grantFlashbackToGraveyardCards`, CR 613.1f) and the effect of a spell that does it until end of turn (`gainFlashbackFromManaCost`, CR 611.2a, 611.2c).
 */
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrClause, IrNoun, IrStaticEffect } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerFailure, Lowering, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type GraveyardFlashback = Extract<IrStaticEffect, { kind: 'graveyardFlashback' }>;

export function isGraveyardFlashbackStatic(effect: IrStaticEffect): effect is GraveyardFlashback {
  return effect.kind === 'graveyardFlashback';
}

const staticFailure = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/**
 * The cards of a graveyard that get the flashback, by what they are (`lowerFilter` of the noun the rule built: card types only, no zone and no controller, which the engine's nodes
 * refuse). Null when the filter says anything else.
 */
function cardsOf(noun: IrNoun): LowerResult<ObjectFilter> {
  const filter = lowerFilter(noun);
  if (!filter.ok) return filter;
  const { zone, controller, owner, ...rest } = filter.value;
  void zone;
  void controller;
  void owner;
  return { ok: true, value: rest, rule: noun.rule };
}

/** "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.": a statement about the graveyard of the controller, with no condition of its own. */
export function lowerGraveyardFlashbackStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isGraveyardFlashbackStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return staticFailure(ability);
  }
  const blocked = missingFeatures(['ability:static', 'static:grantFlashbackToGraveyardCards']);
  if (blocked.length > 0) return staticFailure(ability, blocked);
  const what = cardsOf(effect.cards);
  if (!what.ok) return what;
  return {
    ok: true,
    value: [
      { kind: 'static', static: { kind: 'grantFlashbackToGraveyardCards', what: what.value } },
    ],
    rule: ability.rule,
  };
}

/**
 * "Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost." (CR 702.34a, 611.2a, 611.2c): the engine's
 * `gainFlashbackFromManaCost`, the cards fixed as the effect resolves.
 */
const GAIN_FLASHBACK_FROM_MANA_COST: Lowering<IrClause, Effects> = {
  head: 'gainFlashbackFromManaCost',
  id: 'lower.gain-flashback-from-mana-cost',
  needs: ['effect:gainFlashbackFromManaCost', 'duration:untilEndOfTurn'],
  lower(clause) {
    const cards = operand(clause, 'cards');
    if (cards?.kind !== 'noun') return failure(clause);
    const what = cardsOf(cards);
    if (!what.ok) return what;
    return {
      ok: true,
      value: [{ kind: 'gainFlashbackFromManaCost', what: what.value, duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

export const JESKAI_FLASHBACK_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  GAIN_FLASHBACK_FROM_MANA_COST,
];
