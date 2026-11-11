/**
 * Lowerings of stage P33 (D-149, D-150): the instruction "proliferate" and the static abilities of the Angels slice that are not a layer
 * or a play rule: the protections of a player ("You have hexproof.", "You can't lose the game and your opponents can't win the game."),
 * damage prevented to the permanent itself, a card that can't be cast early, and the permanents that enter with counters. Each declares
 * the engine features it needs and is gated before anything is built, like every lowering.
 */
import type { Ability, Condition, CountAmount, ManaSpentAmount } from '@commander-arena/engine';
import type { IrAbility, IrClause, IrStaticEffect } from '../ir/types';
import { lowerAmount } from './amounts';
import { withoutZone } from './attachments';
import type { Effects } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import {
  type LowerContext,
  type LowerFailure,
  type Lowering,
  type LowerResult,
  newContext,
} from './types';

type Static = Extract<IrAbility, { kind: 'static' }>;
type At = { readonly span: { start: number; end: number }; readonly rule: string };

function failure(node: At, needs: readonly FeatureRef[] = []): LowerFailure {
  return { ok: false, needs, at: node.span, rule: node.rule };
}

/** `proliferate` (CR 701.34): choose any number of permanents and players with counters, and give each another counter of each kind. */
const PROLIFERATE: Lowering<IrClause, Effects> = {
  head: 'proliferate',
  id: 'lower.proliferate',
  needs: ['effect:proliferate'],
  lower: (clause) => ({ ok: true, value: [{ kind: 'proliferate' }], rule: clause.rule }),
};

export const ANGEL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PROLIFERATE];

/** The static effects this file lowers. */
export type AngelStaticEffect = Extract<
  IrStaticEffect,
  {
    kind:
      | 'playerHexproof'
      | 'cantLoseGame'
      | 'opponentsCantWin'
      | 'preventDamageToThis'
      | 'cantCastThis'
      | 'othersEnterWithCounters';
  }
>;

export function isAngelStatic(effect: IrStaticEffect): effect is AngelStaticEffect {
  return (
    effect.kind === 'playerHexproof' ||
    effect.kind === 'cantLoseGame' ||
    effect.kind === 'opponentsCantWin' ||
    effect.kind === 'preventDamageToThis' ||
    effect.kind === 'cantCastThis' ||
    effect.kind === 'othersEnterWithCounters'
  );
}

/**
 * "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control." (stage P33, D-150, CR 614.1c,
 * 614.12): the engine's `othersEnterWithCounters`, a replacement effect of the permanent. The permanents are the subject's filter as they
 * would be on the battlefield (no zone; "other" leaves this permanent out); the count is a number or a count of permanents.
 */
function lowerOthersEnter(
  ability: Static,
  effect: Extract<AngelStaticEffect, { kind: 'othersEnterWithCounters' }>,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const subject = ability.statement.subject;
  const blocked = missingFeatures(['ability:replacement', 'replacement:othersEnterWithCounters']);
  if (blocked.length > 0) return failure(ability, blocked);
  if (subject.det !== 'each') return failure(ability);
  const what = lowerFilter({ ...subject, filter: withoutZone(subject.filter) });
  if (!what.ok) return what;
  // "Each Dragon you control enters with ..." (stage P34, D-152): with no "other" the permanent would count itself if it were such a permanent;
  // only a permanent that surely is not one (a type or a creature type of the kind that it does not have) is read, anything else is refused.
  if (!subject.other) {
    const { types = [], subtypes = [], anyOf } = what.value;
    const notSelf =
      anyOf === undefined &&
      (types.some((t) => !ctx.faceTypes.includes(t)) ||
        subtypes.some((t) => !ctx.faceSubtypes.includes(t)));
    if (!notSelf) return failure(ability);
  }
  let count: number | CountAmount | ManaSpentAmount;
  if (effect.count.kind === 'number') {
    count = effect.count.value;
  } else if (effect.count.kind === 'manaSpent') {
    // "for each mana from an artifact source spent to cast it" (stage P39, D-184, CR 601.2h): the mana spent to cast the permanent that enters.
    const spentFeature = missingFeatures(['amount:manaSpent']);
    if (spentFeature.length > 0) return failure(ability, spentFeature);
    count = {
      kind: 'manaSpent',
      ...(effect.count.fromType === undefined ? {} : { fromType: effect.count.fromType }),
    };
  } else {
    // "for each Angel you already control": counted for the controller of the permanent, without the one that enters.
    const counted = lowerAmount(effect.count, newContext('ability', []), ability.rule);
    if (!counted.ok) return counted;
    if (typeof counted.value !== 'object' || counted.value.kind !== 'countOf') {
      return failure(ability);
    }
    const countFeature = missingFeatures(['amount:countOf']);
    if (countFeature.length > 0) return failure(ability, countFeature);
    count = counted.value;
  }
  return {
    ok: true,
    value: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'othersEnterWithCounters',
          what: what.value,
          counter: effect.counter,
          count,
        },
      },
    ],
    rule: ability.rule,
  };
}

/** One static ability of this slice, or the failure that says what the engine lacks. */
export function lowerAngelStatic(
  ability: Static,
  ctx: LowerContext,
): LowerResult<readonly Ability[]> {
  const { statement } = ability;
  const { subject, effects } = statement;
  const [first] = effects;
  if (first === undefined || statement.condition !== undefined || statement.also !== undefined) {
    return failure(ability);
  }
  if (first.kind === 'othersEnterWithCounters') {
    return effects.length === 1 ? lowerOthersEnter(ability, first, ctx) : failure(ability);
  }
  const abilities: Ability[] = [];
  for (const effect of effects) {
    switch (effect.kind) {
      case 'playerHexproof':
      case 'cantLoseGame':
      case 'opponentsCantWin': {
        // The controller of the permanent is the player: "You" is the subject, and "your opponents" are said of them.
        if (subject.det !== 'you') return failure(ability);
        const blocked = missingFeatures(['ability:static', `static:${effect.kind}`]);
        if (blocked.length > 0) return failure(ability, blocked);
        abilities.push({ kind: 'static', static: { kind: effect.kind } });
        break;
      }
      case 'preventDamageToThis': {
        if (subject.det !== 'self') return failure(ability);
        const blocked = missingFeatures(['ability:static', 'static:preventDamageToThis']);
        if (blocked.length > 0) return failure(ability, blocked);
        abilities.push({
          kind: 'static',
          static: { kind: 'preventDamageToThis', subject: { kind: 'this' }, scope: effect.scope },
        });
        break;
      }
      case 'cantCastThis': {
        // CR 101.2, 500.1: the card can't be cast during the first N turns of the player who would cast it.
        if (subject.det !== 'self' || effects.length !== 1) return failure(ability);
        const blocked = missingFeatures([
          'ability:static',
          'static:cantCastThis',
          'ability:staticCondition',
          'condition:ownTurnNumber',
        ]);
        if (blocked.length > 0) return failure(ability, blocked);
        const condition: Condition = {
          kind: 'ownTurnNumber',
          compare: { cmp: 'atMost', value: effect.turns },
        };
        abilities.push({ kind: 'static', static: { kind: 'cantCastThis' }, condition });
        break;
      }
      default:
        return failure(ability);
    }
  }
  return { ok: true, value: abilities, rule: ability.rule };
}

/** Features the lowerings of this file can name, for the dimension test. */
export const ANGEL_NEEDS: readonly FeatureRef[] = [
  'effect:proliferate',
  'static:playerHexproof',
  'static:cantLoseGame',
  'static:opponentsCantWin',
  'static:preventDamageToThis',
  'static:cantCastThis',
  'condition:ownTurnNumber',
  'replacement:othersEnterWithCounters',
  'replacement:lifeGainBonus',
  'static:blockTax',
  'castAlternative:tapPermanents',
  'manaProduction:chosenColor',
  'ability:manaSpendOnly',
];
