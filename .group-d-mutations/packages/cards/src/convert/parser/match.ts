import { compileLine } from './compile';
import { DEFAULT_RULES } from './rules/index';
import { buildRuleSet } from './rules/registry';
import type { AbilityMatch, GrammarRule } from './types';

/**
 * Matches one normalized ability text against the grammar: a façade over the pipeline (segment,
 * read, bind, lower) with the shape the first parser had. A failure keeps only `stoppedAt` and
 * `closestRule`; the reason, slot and needed features are in `compileLine`'s `LineFailure`.
 * Spell text is not read here: this is the ability grammar of a permanent.
 */
export function matchAbility(
  text: string,
  rules: readonly GrammarRule[] = DEFAULT_RULES,
): AbilityMatch {
  const result = compileLine(text, { rules: buildRuleSet(rules), face: 'permanent' });
  if (!result.ok) {
    return {
      ok: false,
      stoppedAt: result.failure.stoppedAt,
      closestRule: result.failure.closestRule,
    };
  }
  if (result.kind === 'spell') {
    // Unreachable for a permanent face: the spell reading is off. Kept total for the type.
    return { ok: false, stoppedAt: text, closestRule: result.ruleId };
  }
  if (result.kind === 'faceCosts') {
    // "As an additional cost to cast ~, ..." is read, and is no ability: it is a field of the face.
    return { ok: true, ruleId: result.ruleId, abilities: [] };
  }
  return { ok: true, ruleId: result.ruleId, abilities: result.abilities };
}
