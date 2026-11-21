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
      | 'revealTopOfLibrary'
      | 'playLandsFromTopOfLibrary'
      | 'playLandsFromGraveyard'
      | 'graveyardPlayEachType'
      | 'activateAsThoughHaste'
      | 'attackTax'
      | 'optionalUntap'
      | 'crewSaddleBonus'
      | 'blockTax'
      | 'untapInOthersStep';
  }
>;

export function isPlayRule(effect: IrStaticEffect): effect is PlayRuleEffect {
  return (
    effect.kind === 'additionalLandDrops' ||
    effect.kind === 'lookAtTopOfLibrary' ||
    effect.kind === 'revealTopOfLibrary' ||
    effect.kind === 'playLandsFromTopOfLibrary' ||
    effect.kind === 'playLandsFromGraveyard' ||
    effect.kind === 'graveyardPlayEachType' ||
    effect.kind === 'activateAsThoughHaste' ||
    effect.kind === 'attackTax' ||
    effect.kind === 'blockTax' ||
    effect.kind === 'optionalUntap' ||
    effect.kind === 'crewSaddleBonus' ||
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
    case 'revealTopOfLibrary':
      return ['static:revealTopOfLibrary'];
    case 'playLandsFromTopOfLibrary':
      return effect.alsoLook === true
        ? ['static:lookAtTopOfLibrary', 'static:playLandsFromTopOfLibrary']
        : ['static:playLandsFromTopOfLibrary'];
    case 'playLandsFromGraveyard':
      return ['static:playLandsFromGraveyard'];
    case 'graveyardPlayEachType':
      return ['static:playFromGraveyardEachType'];
    case 'activateAsThoughHaste':
      return ['static:activateAsThoughHaste'];
    case 'attackTax':
      return ['static:attackTax', 'cost:mana'];
    // Stage P33 (D-150): "Creatures can't block unless their controller pays {1} for each of those creatures."
    case 'blockTax':
      return ['static:blockTax', 'cost:mana'];
    case 'optionalUntap':
      return ['static:optionalUntap'];
    case 'crewSaddleBonus':
      return ['static:crewSaddleBonus'];
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
    // "Play with the top card of your library revealed." (Oracle of Mul Daya, CR 401.5).
    case 'revealTopOfLibrary':
      return ok({ kind: 'static', static: { kind: 'revealTopOfLibrary' } });
    // "You may play Forests from your graveyard." (Death Toll deck, group D, CR 305.1): the land cards of the named basic land type, or any land.
    case 'playLandsFromGraveyard':
      return ok({
        kind: 'static',
        static: {
          kind: 'playLandsFromGraveyard',
          lands:
            effect.landType === undefined
              ? { types: ['land'] }
              : { types: ['land'], subtypes: [effect.landType] },
        },
      });
    // "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard." (Muldrotha, CR 601.2a, 305.1).
    case 'graveyardPlayEachType':
      return ok({ kind: 'static', static: { kind: 'playFromGraveyardEachType' } });
    // "You may play lands from the top of your library." (Oracle of Mul Daya, CR 305.1, 401.5): any land card on top; with `alsoLook`, "You may look at the top card of your library any time" is in the same sentence (issue 345).
    case 'playLandsFromTopOfLibrary': {
      const play: Ability = { kind: 'static', static: { kind: 'playLandsFromTopOfLibrary' } };
      return {
        ok: true,
        value:
          effect.alsoLook === true
            ? [{ kind: 'static', static: { kind: 'lookAtTopOfLibrary' } }, play]
            : [play],
        rule: at.rule,
      };
    }
    // "You may activate abilities of creatures you control as though those creatures had haste." (issue 345, CR 702.10b): the creatures of the controller.
    case 'activateAsThoughHaste':
      return ok({
        kind: 'static',
        static: {
          kind: 'activateAsThoughHaste',
          creatures: { types: ['creature'], controller: 'you' },
        },
      });
    case 'optionalUntap':
      return ok({ kind: 'static', static: { kind: 'optionalUntap' } });
    // "~ saddles Mounts and crews Vehicles as though its power were 2 greater." (Galadriel deck group 3, CR 702.122a): the creature itself, a bonus to the power it counts for the cost.
    case 'crewSaddleBonus':
      return ok({ kind: 'static', static: { kind: 'crewSaddleBonus', amount: effect.amount } });
    case 'untapInOthersStep':
      // "Untap all creatures you control during each other player's untap step." (stage P68, D-229): the creatures of the controller.
      // "Untap ~ during each other player's untap step." (D-320): the permanent itself.
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
          ...(effect.perCounter === true ? { perCounter: true as const } : {}),
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
  'static:revealTopOfLibrary',
  'static:playLandsFromTopOfLibrary',
  'static:playLandsFromGraveyard',
  'static:playFromGraveyardEachType',
  'static:activateAsThoughHaste',
  'static:attackTax',
  'static:blockTax',
  'static:optionalUntap',
  'static:crewSaddleBonus',
  'static:untapInOthersUntapStep',
];
