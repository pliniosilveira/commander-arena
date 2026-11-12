/**
 * The four static abilities that change what a player may do in a turn (stage P24, D-125; ENGINE_VERSION 24):
 * "You may play an additional land on each of your turns." (CR 305.2), "You may look at the top card of your
 * library any time." (CR 401.5), "Creatures can't attack you unless their controller pays {2} for each creature
 * they control that's attacking you." (CR 508.1d, 508.1h) and "You may choose not to untap ~ during your untap
 * step." (CR 502.3). Each is one engine `static` ability, declared by its own `static:` feature; the attack tax
 * also names `cost:mana` (the engine pays it with the planner of every other payment, so a hybrid or Phyrexian
 * symbol is lowered too).
 */
import type { Ability } from '@commander-arena/engine';
import type { IrStaticEffect } from '../ir/types';
import { lowerCost } from './costs';
import { type FeatureRef, missingFeatures } from './features';
import type { LowerResult } from './types';

type At = { readonly span: { start: number; end: number }; readonly rule: string };

/** The kinds of effect this file lowers. */
export type PlayRuleEffect = Extract<
  IrStaticEffect,
  {
    kind:
      | 'additionalLandDrops'
      | 'lookAtTopOfLibrary'
      | 'attackTax'
      | 'optionalUntap'
      | 'blockTax'
      | 'untapInOthersStep';
  }
>;

export function isPlayRule(effect: IrStaticEffect): effect is PlayRuleEffect {
  return (
    effect.kind === 'additionalLandDrops' ||
    effect.kind === 'lookAtTopOfLibrary' ||
    effect.kind === 'attackTax' ||
    effect.kind === 'blockTax' ||
    effect.kind === 'optionalUntap' ||
    effect.kind === 'untapInOthersStep'
  );
}

/** What the effect needs from the engine, whether or not it can be lowered. */
export function playRuleNeeds(effect: PlayRuleEffect): FeatureRef[] {
  switch (effect.kind) {
    case 'additionalLandDrops':
      return ['static:additionalLandDrops'];
    case 'lookAtTopOfLibrary':
      return ['static:lookAtTopOfLibrary'];
    case 'attackTax':
      return ['static:attackTax', 'cost:mana'];
    // Stage P33 (D-150): "Creatures can't block unless their controller pays {1} for each of those creatures."
    case 'blockTax':
      return ['static:blockTax', 'cost:mana'];
    case 'optionalUntap':
      return ['static:optionalUntap'];
    case 'untapInOthersStep':
      return ['static:untapInOthersUntapStep'];
  }
}

/** The ability, or the failure naming what the engine lacks. A statement of one effect, no condition. */
export function lowerPlayRule(at: At, effect: PlayRuleEffect): LowerResult<readonly Ability[]> {
  const needs: FeatureRef[] = ['ability:static', ...playRuleNeeds(effect)];
  const missing = missingFeatures(needs);
  if (missing.length > 0) return { ok: false, needs: missing, at: at.span, rule: at.rule };
  const ok = (value: Ability): LowerResult<readonly Ability[]> => ({
    ok: true,
    value: [value],
    rule: at.rule,
  });
  switch (effect.kind) {
    case 'additionalLandDrops':
      return ok({
        kind: 'static',
        static: {
          kind: 'additionalLandDrops',
          count: effect.count,
          ...(effect.eachPlayer === true ? { eachPlayer: true as const } : {}),
        },
      });
    case 'lookAtTopOfLibrary':
      return ok({ kind: 'static', static: { kind: 'lookAtTopOfLibrary' } });
    case 'optionalUntap':
      return ok({ kind: 'static', static: { kind: 'optionalUntap' } });
    case 'untapInOthersStep':
      // "Untap all creatures you control during each other player's untap step." (stage P68, D-229): the creatures of the controller.
      // "Untap ~ during each other player's untap step." (D-983): the permanent itself.
      return ok({
        kind: 'static',
        static:
          effect.self === true
            ? { kind: 'untapInOthersUntapStep', self: true }
            : {
                kind: 'untapInOthersUntapStep',
                what: { types: ['creature'], controller: 'you' },
              },
      });
    case 'attackTax': {
      const cost = lowerCost(effect.cost, { hybrid: true });
      if (!cost.ok) return cost;
      return ok({
        kind: 'static',
        static: {
          kind: 'attackTax',
          cost: [cost.value],
          ...(effect.planeswalkers === true ? { planeswalkers: true as const } : {}),
        },
      });
    }
    case 'blockTax': {
      const cost = lowerCost(effect.cost, { hybrid: true });
      if (!cost.ok) return cost;
      return ok({
        kind: 'static',
        static: {
          kind: 'blockTax',
          cost: [cost.value],
          ...(effect.whileAttacking === true ? { whileAttacking: true as const } : {}),
        },
      });
    }
  }
}

/** Features the play-rule lowerings can name, for the dimension test. */
export const PLAY_RULE_NEEDS: readonly FeatureRef[] = [
  'static:additionalLandDrops',
  'static:lookAtTopOfLibrary',
  'static:attackTax',
  'static:blockTax',
  'static:optionalUntap',
  'static:untapInOthersUntapStep',
];
