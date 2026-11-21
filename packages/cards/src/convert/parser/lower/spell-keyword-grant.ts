/**
 * Static lowering of "Creature spells you cast have demonstrate." (issue 145; CR 702.144a, 702.51a, 613.1f): the engine's `grantKeywordToSpells`, a static ability of a permanent that
 * gives a keyword to the spells its controller casts that a filter names.
 */
import type { Ability } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { lowerCost } from './costs';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type SpellKeyword = Extract<IrStaticEffect, { kind: 'spellKeyword' }>;
type SpellEvoke = Extract<IrStaticEffect, { kind: 'spellEvoke' }>;

export function isSpellEvokeStatic(effect: IrStaticEffect): effect is SpellEvoke {
  return effect.kind === 'spellEvoke';
}

/**
 * "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them." (CR 702.74a, 118.9, 601.2b): the engine's `grantAlternativeCostToSpells`, a static ability of a
 * permanent that gives the spells of its controller a filter names an evoke cost as they are cast from the hand. The statement has one effect and no condition of its own.
 */
export function lowerSpellEvokeStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  const fail = (needs: ReturnType<typeof missingFeatures> = []) => ({
    ok: false as const,
    needs,
    at: ability.span,
    rule: ability.rule,
  });
  if (
    effect === undefined ||
    !isSpellEvokeStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'each' ||
    statement.subject.filter.controller !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return fail();
  }
  const blocked = missingFeatures([
    'ability:static',
    'static:grantAlternativeCostToSpells',
    'castAlternative:evoke',
    'cost:mana',
  ]);
  if (blocked.length > 0) return fail(blocked);
  const what = lowerFilter(statement.subject);
  if (!what.ok) return what;
  const cost = lowerCost(effect.cost);
  if (!cost.ok) return cost;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'grantAlternativeCostToSpells',
          what: what.value,
          from: 'hand',
          alt: { kind: 'evoke', cost: [cost.value] },
        },
      },
    ],
    rule: ability.rule,
  };
}

export function isSpellKeywordStatic(effect: IrStaticEffect): effect is SpellKeyword {
  return effect.kind === 'spellKeyword';
}

/** The statement has one effect, the spells of the controller as its subject, and no condition of its own. */
export function lowerSpellKeywordStatic(ability: Static): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const [effect, ...more] = statement.effects;
  const fail = (needs: ReturnType<typeof missingFeatures> = []) => ({
    ok: false as const,
    needs,
    at: ability.span,
    rule: ability.rule,
  });
  if (
    effect === undefined ||
    !isSpellKeywordStatic(effect) ||
    more.length > 0 ||
    statement.subject.det !== 'each' ||
    statement.subject.filter.controller !== 'you' ||
    statement.condition !== undefined ||
    statement.also !== undefined ||
    statement.functionsIn !== undefined
  ) {
    return fail();
  }
  const blocked = missingFeatures([
    'ability:static',
    'static:grantKeywordToSpells',
    // "has replicate. The replicate cost is equal to its mana cost" is the engine's Replicate with a cost taken from the spell.
    effect.keyword === 'replicateAtManaCost' ? 'keyword:replicate' : `keyword:${effect.keyword}`,
  ]);
  if (blocked.length > 0) return fail(blocked);
  const what = lowerFilter(statement.subject);
  if (!what.ok) return what;
  return {
    ok: true,
    value: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: what.value,
          keyword: { kind: effect.keyword },
        },
      },
    ],
    rule: ability.rule,
  };
}
