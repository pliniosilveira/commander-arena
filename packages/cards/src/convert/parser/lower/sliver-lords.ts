/**
 * Static lowering of the Sliver lords' statements (issue 133, group B): "The "legend rule" doesn't apply to Slivers you control." (`legendRuleDoesntApply`, CR 704.5j), "Slivers you
 * control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature cards you own
 * that aren't on the battlefield." (`giveChosenCreatureType`, CR 613.1d) and "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value."
 * (`grantEncoreToGraveyardCards`, CR 702.141a).
 */
import type { Ability, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrNoun, IrStaticEffect } from '../ir/types';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;

const KINDS = [
  'legendRuleDoesntApply',
  'chosenTypeGroups',
  'graveyardEncore',
  'graveyardUnearth',
] as const;

export function isSliverLordStatic(effect: IrStaticEffect): boolean {
  return (KINDS as readonly string[]).includes(effect.kind);
}

/** The features each of the statements needs of the engine. */
export function sliverLordNeeds(effect: IrStaticEffect): readonly FeatureRef[] {
  switch (effect.kind) {
    case 'legendRuleDoesntApply':
      return ['static:legendRuleDoesntApply'];
    case 'chosenTypeGroups':
      return ['static:giveChosenCreatureType'];
    case 'graveyardEncore':
      return ['static:grantEncoreToGraveyardCards'];
    case 'graveyardUnearth':
      return ['static:grantUnearthToGraveyardCards'];
    default:
      return [];
  }
}

export const SLIVER_LORD_NEEDS: readonly FeatureRef[] = [
  'static:legendRuleDoesntApply',
  'static:giveChosenCreatureType',
  'static:grantEncoreToGraveyardCards',
  'static:grantUnearthToGraveyardCards',
];

const failureOf = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/** The cards of a graveyard by what they are: no zone, controller, owner or card marker, which the engine's node refuses. */
function cardsOf(noun: IrNoun): LowerResult<ObjectFilter> {
  const filter = lowerFilter(noun);
  if (!filter.ok) return filter;
  const { zone, controller, owner, ...rest } = filter.value;
  void zone;
  void controller;
  void owner;
  return { ok: true, value: rest, rule: noun.rule };
}

/** A statement with one effect, no condition, no second part and no zone it works in. */
export function lowerSliverLordStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    more.length > 0 ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return failureOf(ability);
  }
  const blocked = missingFeatures(['ability:static', ...sliverLordNeeds(effect)]);
  if (blocked.length > 0) return failureOf(ability, blocked);
  if (effect.kind === 'graveyardEncore') {
    if (statement.subject.det !== 'you') return failureOf(ability);
    const what = cardsOf(effect.cards);
    if (!what.ok) return what;
    return {
      ok: true,
      value: [
        { kind: 'static', static: { kind: 'grantEncoreToGraveyardCards', what: what.value } },
      ],
      rule: ability.rule,
    };
  }
  // CR 702.84a (Solemn Doomguide): Unearth with a plain mana cost.
  if (effect.kind === 'graveyardUnearth') {
    if (statement.subject.det !== 'you') return failureOf(ability);
    const what = cardsOf(effect.cards);
    if (!what.ok) return what;
    const cost = lowerCost(effect.cost);
    if (!cost.ok) return cost;
    return {
      ok: true,
      value: [
        {
          kind: 'static',
          static: { kind: 'grantUnearthToGraveyardCards', what: what.value, cost: [cost.value] },
        },
      ],
      rule: ability.rule,
    };
  }
  if (statement.subject.det !== 'each') return failureOf(ability);
  const what = lowerFilter(statement.subject);
  if (!what.ok) return what;
  if (effect.kind === 'legendRuleDoesntApply') {
    return {
      ok: true,
      value: [{ kind: 'static', static: { kind: 'legendRuleDoesntApply', what: what.value } }],
      rule: ability.rule,
    };
  }
  if (effect.kind === 'chosenTypeGroups') {
    return {
      ok: true,
      value: [
        {
          kind: 'static',
          static: { kind: 'giveChosenCreatureType', what: what.value, alsoCardsAndSpells: true },
        },
      ],
      rule: ability.rule,
    };
  }
  return failureOf(ability);
}
