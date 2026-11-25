/**
 * Lowerings of the Planeswalker Party deck (issue 132, Vronos, Masked Inquisitor).
 */
import type { Effect, Keyword } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { grantedKeyword } from '../rules/keyword/vocabulary';
import { arg, type Effects, eachObject, failure } from './clauses';
import type { Lowering } from './types';

/** "... phase out at the beginning of the next end step": a delayed phase out of the targets, bound as the ability resolves (CR 603.7c). */
const PHASE_OUT_AT_END_STEP: Lowering<IrClause, Effects> = {
  head: 'phaseOutAtEndStep',
  id: 'lower.phase-out-at-end-step',
  needs: ['effect:delayedTrigger', 'effect:phaseOut', 'selector:target'],
  lower(clause, ctx) {
    const lowered = eachObject(
      clause,
      ctx,
      (objects) => ({
        kind: 'delayedTrigger',
        at: { step: 'endStep', whose: 'each' },
        effect: { kind: 'phaseOut', objects },
      }),
      'objects',
    );
    if (!lowered.ok) return lowered;
    const targets = lowered.value.every(
      (e) =>
        e.kind === 'delayedTrigger' &&
        e.effect.kind === 'phaseOut' &&
        e.effect.objects.kind === 'target',
    );
    return targets ? lowered : failure(clause);
  },
};

/**
 * "Target artifact you control becomes a 9/9 Construct artifact creature and gains vigilance, indestructible, and \"This creature can't be blocked.\"" (CR 613.1d, 613.1f, 613.4b, 509.1b):
 * for the rest of the game, in the order of the layers: the creature type and base power and toughness (one `setTypes`), the keywords, and the restriction.
 */
const BECOMES_FOR_GOOD_UNBLOCKABLE: Lowering<IrClause, Effects> = {
  head: 'becomesForGoodUnblockable',
  id: 'lower.becomes-for-good-unblockable',
  needs: ['effect:setTypes', 'effect:grantKeyword', 'effect:restrict'],
  lower(clause, ctx) {
    const types = arg(clause, 'types');
    const base = arg(clause, 'basePt');
    if (types?.kind !== 'typeList' || base?.kind !== 'basePt') return failure(clause);
    const keywords: Keyword[] = [];
    for (let i = 0; ; i += 1) {
      const word = arg(clause, `keyword${i}`);
      if (word === undefined) break;
      if (word.kind !== 'keywordName') return failure(clause);
      const keyword = grantedKeyword(word.name);
      if (keyword === undefined) return failure(clause);
      keywords.push(keyword);
    }
    if (keywords.length === 0) return failure(clause);
    return lowerAll(
      clause,
      ctx,
      types.subtypes,
      { power: base.power, toughness: base.toughness },
      keywords,
    );
  },
};

function lowerAll(
  clause: IrClause,
  ctx: Parameters<typeof eachObject>[1],
  subtypes: readonly string[],
  basePt: { power: number; toughness: number },
  keywords: readonly Keyword[],
) {
  const out: Effect[] = [];
  const lowered = eachObject(clause, ctx, (objects) => {
    out.push(
      {
        kind: 'setTypes',
        objects,
        types: ['creature'],
        subtypes: [...subtypes],
        additive: true,
        basePt,
        duration: 'permanent',
      },
      ...keywords.map(
        (keyword): Effect => ({ kind: 'grantKeyword', objects, keyword, duration: 'permanent' }),
      ),
      { kind: 'restrict', objects, restriction: 'cantBeBlocked', duration: 'permanent' },
    );
    return out[0] as Effect;
  });
  return lowered.ok ? { ok: true as const, value: out, rule: clause.rule } : lowered;
}

export const VRONOS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PHASE_OUT_AT_END_STEP,
  BECOMES_FOR_GOOD_UNBLOCKABLE,
];
