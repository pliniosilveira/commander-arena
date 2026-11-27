/**
 * Lowerings of the Counter Intelligence deck, group 3 (copies, permanents that become creatures for good, and the permanents a proliferate gave counters to; CR 707.2, 613.1d, 701.34a,
 * 702.26a).
 */
import type { CardType, Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, eachObject, failure, operand } from './clauses';
import type { FeatureRef } from './features';
import { objectRefOf } from './nouns';
import type { Lowering } from './types';

/** The id the permanents a proliferate gave counters to are chosen under (the choice and the phasing out are one sentence pair). */
const PROLIFERATED = 'proliferated';

/**
 * "~ becomes a copy of target nontoken artifact you control with mana value X" (The Mycosynth Gardens, CR 707.2, 611.2a): the engine's `becomeCopy` of the permanent with the
 * ability, of the target, for good (a layer 1 effect with no duration).
 */
const BECOME_COPY_OF_TARGET: Lowering<IrClause, Effects> = {
  head: 'becomeCopyOfTarget',
  id: 'lower.become-copy-of-target',
  needs: ['effect:becomeCopy', 'selector:target', 'selector:this'],
  lower(clause, ctx) {
    const objects = operand(clause, 'objects');
    const of = operand(clause, 'of');
    if (objects?.kind !== 'noun' || of?.kind !== 'noun') return failure(clause);
    const self = objectRefOf(objects, ctx);
    if (!self.ok) return self;
    if (self.value.kind !== 'this') return failure(clause);
    const source = objectRefOf(of, ctx);
    if (!source.ok) return source;
    if (source.value.kind !== 'target') return failure(clause);
    return {
      ok: true,
      value: [
        { kind: 'becomeCopy', objects: { kind: 'this' }, of: source.value, duration: 'permanent' },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "any number of target noncreature artifacts you control become 3/3 artifact creatures" (Depthshaker Titan, CR 205.1b, 613.1d, 613.4b, 611.2a): the engine's additive `setTypes` of the
 * targets with their base power and toughness, for good.
 */
const BECOME_CREATURES_FOR_GOOD: Lowering<IrClause, Effects> = {
  head: 'becomeCreaturesForGood',
  id: 'lower.become-creatures-for-good',
  needs: ['effect:setTypes', 'selector:target'],
  lower(clause, ctx) {
    const types = arg(clause, 'types');
    const base = arg(clause, 'basePt');
    if (types?.kind !== 'typeList' || base?.kind !== 'basePt' || types.cardTypes === undefined) {
      return failure(clause);
    }
    return eachObject(
      clause,
      ctx,
      (objects): Effect => ({
        kind: 'setTypes',
        objects,
        types: types.cardTypes as CardType[],
        additive: true,
        basePt: { power: base.power, toughness: base.toughness },
        duration: 'permanent',
      }),
    );
  },
};

/**
 * "choose any number of permanents you control that had a counter put on them this way" (Ripples of Potential, CR 701.34a, 608.2d): right after a proliferate, the engine's
 * `chooseObjects` among the permanents it gave counters to (`moved`) that the controller controls, any number of them.
 */
const CHOOSE_PROLIFERATED: Lowering<IrClause, Effects> = {
  head: 'chooseProliferated',
  id: 'lower.choose-proliferated',
  needs: ['effect:chooseObjects', 'effect:proliferate', 'selector:chosen', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'proliferate') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'chooseObjects',
          id: PROLIFERATED,
          filter: { controller: 'you' },
          count: 1,
          anyNumber: true,
          fromMoved: true,
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "Those permanents phase out" (CR 702.26a): the engine's `phaseOut` of the permanents the choice before it made. */
const PHASE_OUT_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'phaseOutChosen',
  id: 'lower.phase-out-chosen',
  needs: ['effect:phaseOut', 'selector:chosen'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'chooseObjects') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'phaseOut', objects: { kind: 'chosen', id: PROLIFERATED } }],
      rule: clause.rule,
    };
  },
};

export const COUNTER_INTELLIGENCE_G3_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  BECOME_COPY_OF_TARGET,
  BECOME_CREATURES_FOR_GOOD,
  CHOOSE_PROLIFERATED,
  PHASE_OUT_CHOSEN,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNTER_INTELLIGENCE_G3_NEEDS: readonly FeatureRef[] = [
  'effect:becomeCopy',
  'selector:target',
  'selector:this',
  'effect:setTypes',
  'effect:chooseObjects',
  'effect:proliferate',
  'selector:chosen',
  'selector:moved',
  'effect:phaseOut',
];
