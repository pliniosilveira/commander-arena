/**
 * Static lowering of "Creature spells you cast have demonstrate." (issue 145; CR 702.144a, 702.51a, 613.1f): the engine's `grantKeywordToSpells`, a static ability of a permanent that
 * gives a keyword to the spells its controller casts that a filter names.
 */
import type { Ability } from '@commander-arena/engine';
import type { IrAbility, IrStaticEffect } from '../ir/types';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerResult } from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type SpellKeyword = Extract<IrStaticEffect, { kind: 'spellKeyword' }>;

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
