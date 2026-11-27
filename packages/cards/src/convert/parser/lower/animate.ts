/**
 * Static lowering of a group that is made creatures (Bello, Bard of the Brambles, issue 110): "During your turn, each non-Equipment artifact and non-Aura enchantment you control
 * with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types and has indestructible, haste, and "Whenever ~ deals combat damage to a player,
 * draw a card."" One static ability of the engine, `animate`: the types (layer 4, CR 613.1d), what the group has (layer 6, CR 613.1f) and the base power and toughness (layer
 * 7b, CR 613.4b) are the parts of one effect (CR 613.6), so the later parts apply to the permanents the first one named.
 */
import type {
  Ability,
  CardType,
  Condition,
  Keyword,
  ObjectFilter,
  StaticEffect,
  StaticSubject,
  Subtype,
} from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import type { LowerFailure, LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type Animate = Extract<IrStaticEffect, { kind: 'animate' }>;
type EngineAnimate = Extract<StaticEffect, { kind: 'animate' }>;
type Granted = NonNullable<EngineAnimate['abilities']>[number];

export function isAnimateStatic(effect: IrStaticEffect): effect is Animate {
  return effect.kind === 'animate';
}

const failure = (node: Static, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: node.span,
  rule: node.rule,
});

/** Whether a filter, or a member of its `anyOf`, compares power or toughness: the group is found in layer 4, before either is set. */
function readsPt(filter: ObjectFilter): boolean {
  return (
    filter.power !== undefined ||
    filter.toughness !== undefined ||
    (filter.anyOf?.some(readsPt) ?? false)
  );
}

/**
 * The statement with its group lowered (`subject`) and its condition, if it has one (`condition`: "during your turn", which reads no characteristic). `grant` lowers one
 * thing the group has as the static ability it would be on its own (`grantKeyword`, `grantAbility`), whose keyword or ability this effect takes.
 */
export function lowerAnimateStatic(
  ability: Static,
  subject: StaticSubject,
  condition: Condition | undefined,
  grant: (effect: IrStaticEffect, subject: StaticSubject) => LowerResult<StaticEffect>,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  if (
    effect === undefined ||
    !isAnimateStatic(effect) ||
    more.length > 0 ||
    subject.kind !== 'filter' ||
    subject.other === true ||
    readsPt(subject.filter) ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return failure(ability);
  }
  const blocked = missingFeatures([
    'ability:static',
    'static:animate',
    ...(condition === undefined ? [] : (['ability:staticCondition'] as const)),
  ]);
  if (blocked.length > 0) return failure(ability, blocked);
  const keywords: Keyword[] = [];
  const abilities: Granted[] = [];
  for (const given of effect.grants) {
    const lowered = grant(given, subject);
    if (!lowered.ok) return lowered;
    const made = lowered.value;
    if (made.kind === 'grantKeyword' && Object.keys(made.keyword).length === 1) {
      keywords.push(made.keyword);
    } else if (made.kind === 'grantAbility' && made.ability.kind !== 'static') {
      abilities.push(made.ability);
    } else {
      return failure(ability);
    }
  }
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'animate',
          subject,
          types: effect.cardTypes as CardType[],
          ...(effect.subtypes.length === 0 ? {} : { subtypes: effect.subtypes as Subtype[] }),
          power: effect.power,
          toughness: effect.toughness,
          ...(keywords.length === 0 ? {} : { keywords }),
          ...(abilities.length === 0 ? {} : { abilities }),
        },
        ...(condition === undefined ? {} : { condition }),
      },
    ],
    rule: ability.rule,
  };
}
