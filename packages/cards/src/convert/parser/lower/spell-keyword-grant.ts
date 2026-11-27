/**
 * Static lowering of "Creature spells you cast have demonstrate." (issue 145; CR 702.144a, 702.51a, 613.1f): the engine's `grantKeywordToSpells`, a static ability of a permanent that
 * gives a keyword to the spells its controller casts that a filter names.
 */
import type { Ability } from '@commander-arena/engine';
import type { IrAbility, IrClause, IrStaticEffect } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerCost } from './costs';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering, LowerResult } from './types';

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

type SpellOffspring = Extract<IrStaticEffect, { kind: 'spellOffspring' }>;

export function isSpellOffspringStatic(effect: IrStaticEffect): effect is SpellOffspring {
  return effect.kind === 'spellOffspring';
}

/**
 * "Creature spells you cast gain offspring {2} as you cast them." (CR 702.175a, 601.2b, 613.1f): the engine's `grantKeywordToSpells` of an `offspring` keyword with the cost, a static
 * ability of a permanent that gives the spells of its controller a filter names an offspring cost as they are cast. The statement has one effect and no condition of its own.
 */
export function lowerSpellOffspringStatic(ability: Static): LowerResult<readonly Ability[]> {
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
    !isSpellOffspringStatic(effect) ||
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
    'keyword:offspring',
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
          kind: 'grantKeywordToSpells',
          what: what.value,
          keyword: { kind: 'offspring', cost: [cost.value] },
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

/**
 * "it gains sunburst", "that spell gains sunburst" (CR 702.44a, 702.44d): the engine's `spellGainsKeyword` of the spell whose casting caused the trigger (`triggerSubject`, which the
 * binding pass makes of the pronoun in a cast trigger or a "when you next cast" sentence); bound to anything else the pronoun is no spell and nothing is read.
 */
export const SPELL_GAINS_KEYWORD: Lowering<IrClause, Effects> = {
  head: 'spellGainsKeyword',
  id: 'lower.spellGainsKeyword',
  needs: ['effect:spellGainsKeyword', 'keyword:sunburst'],
  lower(clause) {
    const noun = arg(clause, 'spell');
    if (noun?.kind !== 'noun' || noun.det !== 'triggerSubject') return failure(clause);
    const missing = missingFeatures(['selector:triggerSubject']);
    if (missing.length > 0) return failure(clause, missing);
    return {
      ok: true,
      value: [
        {
          kind: 'spellGainsKeyword',
          spell: { kind: 'triggerSubject' },
          keyword: { kind: 'sunburst' },
        },
      ],
      rule: clause.rule,
    };
  },
};
